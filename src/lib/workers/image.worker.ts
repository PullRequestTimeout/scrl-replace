/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import exifr from 'exifr/dist/lite.esm.mjs';
import { downscaleSteps, fitWithin, type Size } from '#lib/images/geometry.ts';
import {
	EXPORT_JPEG_QUALITY,
	EXPORT_SCALE,
	PREVIEW_LONG_EDGE,
	SLIDE_H,
	SLIDE_W,
	STORED_JPEG_QUALITY,
	THUMB_LONG_EDGE,
	WORKING_LONG_EDGE,
	type ColorSpace,
	type ImageVariant
} from '#lib/model/constants.ts';
import {
	backgroundRect,
	cropSource,
	CENTRED,
	frameOuter,
	intersects,
	type Carousel
} from '#lib/model/layout.ts';
import type { PhotoId } from '#lib/model/types.ts';
import { drawCarousel, type DrawSource } from '#lib/render/draw.ts';
import { getBlob } from '#lib/storage/projects.ts';

export interface ProcessedImage {
	width: number;
	height: number;
	workingWidth: number;
	workingHeight: number;
	capturedAt?: number;
	exifDate?: string;
	blobs: Record<ImageVariant, Blob>;
}

export interface PhotoSize {
	id: PhotoId;
	width: number;
	height: number;
}

type Canvas2D = OffscreenCanvasRenderingContext2D;
type Drawable = ImageBitmap | OffscreenCanvas;

function makeCanvas(size: Size, colorSpace: ColorSpace = 'srgb'): [OffscreenCanvas, Canvas2D] {
	const canvas = new OffscreenCanvas(size.width, size.height);
	const ctx = canvas.getContext('2d', { alpha: false, colorSpace });
	if (!ctx) throw new Error('2D canvas unavailable in worker');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	return [canvas, ctx];
}

/** Release canvas backing memory right away; iOS counts it against a tight budget. */
function release(canvas: OffscreenCanvas) {
	canvas.width = 0;
	canvas.height = 0;
}

/** Downscale in halving steps, releasing each intermediate canvas as soon as it's drawn from. */
function downscale(
	source: Drawable,
	sourceSize: Size,
	target: Size,
	colorSpace: ColorSpace
): OffscreenCanvas {
	let current: Drawable = source;
	let currentIsOwned = false;
	for (const step of downscaleSteps(sourceSize, target)) {
		const [canvas, ctx] = makeCanvas(step, colorSpace);
		ctx.drawImage(current, 0, 0, step.width, step.height);
		if (currentIsOwned) release(current as OffscreenCanvas);
		current = canvas;
		currentIsOwned = true;
	}
	return current as OffscreenCanvas;
}

const toJpeg = (canvas: OffscreenCanvas, quality = STORED_JPEG_QUALITY) =>
	canvas.convertToBlob({ type: 'image/jpeg', quality });

// ---------------------------------------------------------------------------
// EXIF

/** EXIF lives in the first APP1 segment; 256 KB covers it even when large XMP/ICC blocks come first. */
const EXIF_HEAD_BYTES = 256 * 1024;

// Only the EXIF IFD holds the capture date. (exifr's `pick` option is broken in the lite build.)
// Raw strings: the date has no timezone, so it's kept as written and interpreted as local time.
const EXIF_OPTIONS = {
	ifd1: false,
	gps: false,
	interop: false,
	exif: true,
	xmp: false,
	iptc: false,
	icc: false,
	jfif: false,
	ihdr: false,
	reviveValues: false
} satisfies Parameters<typeof exifr.parse>[1];

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

async function readCaptureDate(file: Blob): Promise<{ capturedAt?: number; exifDate?: string }> {
	try {
		const head = await file.slice(0, EXIF_HEAD_BYTES).arrayBuffer();
		const tags = await exifr.parse(head, EXIF_OPTIONS);
		const raw: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate;
		if (typeof raw !== 'string') return {};
		const m = EXIF_DATE.exec(raw.trim());
		if (!m) return {};
		const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
		const time = new Date(y, mo - 1, d, h, mi, s).getTime();
		return Number.isNaN(time) ? {} : { capturedAt: time, exifDate: m[0] };
	} catch {
		return {}; // No EXIF, or unreadable: capture time is optional.
	}
}

// ---------------------------------------------------------------------------
// Import

/** Build the working, preview and thumb copies from a decoded image, then free it. */
async function encodeVariants(
	bitmap: ImageBitmap,
	colorSpace: ColorSpace
): Promise<Omit<ProcessedImage, 'capturedAt' | 'exifDate'>> {
	const original = { width: bitmap.width, height: bitmap.height };
	const workingSize = fitWithin(original, WORKING_LONG_EDGE);
	const working = downscale(bitmap, original, workingSize, colorSpace);
	bitmap.close();

	const previewSize = fitWithin(workingSize, PREVIEW_LONG_EDGE);
	const preview = downscale(working, workingSize, previewSize, colorSpace);
	const thumbSize = fitWithin(previewSize, THUMB_LONG_EDGE);
	const thumb = downscale(preview, previewSize, thumbSize, colorSpace);

	const [workingBlob, previewBlob, thumbBlob] = await Promise.all([
		toJpeg(working),
		toJpeg(preview),
		toJpeg(thumb)
	]);
	release(working);
	release(preview);
	release(thumb);

	return {
		...original,
		workingWidth: workingSize.width,
		workingHeight: workingSize.height,
		blobs: { working: workingBlob, preview: previewBlob, thumb: thumbBlob }
	};
}

// ---------------------------------------------------------------------------
// Export

/** Small LRU of decoded working images: neighbouring slides share backgrounds. */
class BitmapLru {
	#items = new Map<PhotoId, ImageBitmap>();
	#max: number;
	constructor(max: number) {
		this.#max = max;
	}

	async get(id: PhotoId): Promise<ImageBitmap> {
		const hit = this.#items.get(id);
		if (hit) {
			this.#items.delete(id);
			this.#items.set(id, hit);
			return hit;
		}
		const blob = await getBlob(id, 'working');
		if (!blob) throw new Error(`Missing image for photo ${id}`);
		const bitmap = await createImageBitmap(blob);
		this.#items.set(id, bitmap);
		while (this.#items.size > this.#max) {
			const [oldId, old] = this.#items.entries().next().value!;
			old.close();
			this.#items.delete(oldId);
		}
		return bitmap;
	}

	clear() {
		for (const b of this.#items.values()) b.close();
		this.#items.clear();
	}
}

function photosOnSlide(carousel: Carousel, slide: number): PhotoId[] {
	const x0 = slide * SLIDE_W;
	const x1 = x0 + SLIDE_W;
	return [
		...carousel.backgrounds
			.filter((b) => intersects(backgroundRect(b), x0, x1))
			.flatMap((b) => (b.photoId ? [b.photoId] : [])),
		...carousel.frames.filter((f) => intersects(frameOuter(f), x0, x1)).map((f) => f.photoId)
	];
}

const api = {
	/** Decode, read capture time and encode stored copies. Throws if this browser can't decode the file in a worker. */
	async processFile(file: Blob, colorSpace: ColorSpace = 'srgb'): Promise<ProcessedImage> {
		const [bitmap, date] = await Promise.all([
			createImageBitmap(file, { imageOrientation: 'from-image' }),
			readCaptureDate(file)
		]);
		return { ...(await encodeVariants(bitmap, colorSpace)), ...date };
	},

	/** Fallback path: the main thread decoded the image and transferred the bitmap. */
	async processBitmap(
		bitmap: ImageBitmap,
		file: Blob,
		colorSpace: ColorSpace = 'srgb'
	): Promise<ProcessedImage> {
		const date = await readCaptureDate(file);
		return { ...(await encodeVariants(bitmap, colorSpace)), ...date };
	},

	/**
	 * Render every slide of a carousel at EXPORT_SCALE × 1080×1350 from the working copies, one slide at a
	 * time on a single canvas. Returns JPEGs in slide order.
	 */
	async renderCarousel(
		carousel: Carousel,
		photos: PhotoSize[],
		colorSpace: ColorSpace = 'srgb',
		quality = EXPORT_JPEG_QUALITY
	): Promise<Blob[]> {
		const sizes = new Map(photos.map((p) => [p.id, p]));
		// 4096px working copies are ~45 MB decoded: keep only a few alive at once.
		const cache = new BitmapLru(3);
		const outSize = { width: SLIDE_W * EXPORT_SCALE, height: SLIDE_H * EXPORT_SCALE };
		const [canvas, ctx] = makeCanvas(outSize, colorSpace);
		const blobs: Blob[] = [];
		try {
			for (let slide = 0; slide < carousel.slideCount; slide++) {
				const sources = new Map<PhotoId, DrawSource>();
				for (const id of photosOnSlide(carousel, slide)) {
					const size = sizes.get(id);
					if (!size || sources.has(id)) continue;
					const image = await cache.get(id);
					sources.set(id, {
						image,
						imageW: image.width,
						imageH: image.height,
						photoW: size.width,
						photoH: size.height
					});
				}
				ctx.fillStyle = '#000';
				ctx.fillRect(0, 0, outSize.width, outSize.height);
				drawCarousel(ctx, carousel, (id) => sources.get(id), {
					originX: slide * SLIDE_W,
					scale: EXPORT_SCALE
				});
				blobs.push(await toJpeg(canvas, quality));
			}
		} finally {
			cache.clear();
			release(canvas);
		}
		return blobs;
	},

	/**
	 * Colour test: the same centre crop of one original, rendered once in sRGB and once in
	 * Display P3, so they can be compared after posting.
	 */
	async colourTest(file: Blob): Promise<{ srgb: Blob; p3: Blob; p3Supported: boolean }> {
		const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		const render = async (colorSpace: ColorSpace) => {
			const [canvas, ctx] = makeCanvas({ width: SLIDE_W, height: SLIDE_H }, colorSpace);
			// getContextAttributes is missing from the OffscreenCanvas typings but exists at runtime.
			const attrs = (
				ctx as unknown as { getContextAttributes?: () => { colorSpace?: string } }
			).getContextAttributes?.();
			const supported = attrs?.colorSpace === colorSpace;
			const src = cropSource(bitmap.width, bitmap.height, SLIDE_W, SLIDE_H, CENTRED);
			ctx.drawImage(bitmap, src.x, src.y, src.w, src.h, 0, 0, SLIDE_W, SLIDE_H);
			const blob = await toJpeg(canvas, EXPORT_JPEG_QUALITY);
			release(canvas);
			return { blob, supported };
		};
		const srgb = await render('srgb');
		const p3 = await render('display-p3');
		bitmap.close();
		return { srgb: srgb.blob, p3: p3.blob, p3Supported: p3.supported };
	}
};

export type ImageWorkerApi = typeof api;

Comlink.expose(api);
