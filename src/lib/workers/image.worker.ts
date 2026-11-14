/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import exifr from 'exifr/dist/lite.esm.mjs';
import { downscaleSteps, fitWithin, type Size } from '#lib/images/geometry.ts';
import {
	PREVIEW_LONG_EDGE,
	STORED_JPEG_QUALITY,
	THUMB_LONG_EDGE,
	WORKING_LONG_EDGE,
	type ImageVariant
} from '#lib/model/constants.ts';

export interface ProcessedImage {
	width: number;
	height: number;
	workingWidth: number;
	workingHeight: number;
	capturedAt?: number;
	blobs: Record<ImageVariant, Blob>;
}

type Canvas2D = OffscreenCanvasRenderingContext2D;
type Drawable = ImageBitmap | OffscreenCanvas;

function makeCanvas(size: Size): [OffscreenCanvas, Canvas2D] {
	const canvas = new OffscreenCanvas(size.width, size.height);
	const ctx = canvas.getContext('2d', { alpha: false });
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
function downscale(source: Drawable, sourceSize: Size, target: Size): OffscreenCanvas {
	let current: Drawable = source;
	let currentIsOwned = false;
	for (const step of downscaleSteps(sourceSize, target)) {
		const [canvas, ctx] = makeCanvas(step);
		ctx.drawImage(current, 0, 0, step.width, step.height);
		if (currentIsOwned) release(current as OffscreenCanvas);
		current = canvas;
		currentIsOwned = true;
	}
	if (!currentIsOwned) {
		// Source was already the target size: copy so the caller always owns the result.
		const [canvas, ctx] = makeCanvas(target);
		ctx.drawImage(current, 0, 0);
		return canvas;
	}
	return current as OffscreenCanvas;
}

const toJpeg = (canvas: OffscreenCanvas) =>
	canvas.convertToBlob({ type: 'image/jpeg', quality: STORED_JPEG_QUALITY });

/** EXIF lives in the first APP1 segment; 256 KB covers it even when large XMP/ICC blocks come first. */
const EXIF_HEAD_BYTES = 256 * 1024;

// Only the EXIF IFD holds the capture date. (exifr's `pick` option is broken in the lite build.)
const EXIF_OPTIONS = {
	ifd1: false,
	gps: false,
	interop: false,
	exif: true,
	xmp: false,
	iptc: false,
	icc: false,
	jfif: false,
	ihdr: false
} satisfies Parameters<typeof exifr.parse>[1];

async function readCaptureTime(file: Blob): Promise<number | undefined> {
	try {
		const head = await file.slice(0, EXIF_HEAD_BYTES).arrayBuffer();
		const tags = await exifr.parse(head, EXIF_OPTIONS);
		const date: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate;
		return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : undefined;
	} catch {
		return undefined; // No EXIF, or unreadable: capture time is optional.
	}
}

/** Build the working, preview and thumb copies from a decoded image, then free it. */
async function encodeVariants(bitmap: ImageBitmap): Promise<Omit<ProcessedImage, 'capturedAt'>> {
	const original = { width: bitmap.width, height: bitmap.height };
	const workingSize = fitWithin(original, WORKING_LONG_EDGE);
	const working = downscale(bitmap, original, workingSize);
	bitmap.close();

	const previewSize = fitWithin(workingSize, PREVIEW_LONG_EDGE);
	const preview = downscale(working, workingSize, previewSize);
	const thumbSize = fitWithin(previewSize, THUMB_LONG_EDGE);
	const thumb = downscale(preview, previewSize, thumbSize);

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

const api = {
	/** Decode, read capture time and encode stored copies. Throws if this browser can't decode the file in a worker. */
	async processFile(file: Blob): Promise<ProcessedImage> {
		const [bitmap, capturedAt] = await Promise.all([
			createImageBitmap(file, { imageOrientation: 'from-image' }),
			readCaptureTime(file)
		]);
		return { ...(await encodeVariants(bitmap)), capturedAt };
	},

	/** Fallback path: the main thread decoded the image and transferred the bitmap. */
	async processBitmap(bitmap: ImageBitmap, file: Blob): Promise<ProcessedImage> {
		const capturedAt = await readCaptureTime(file);
		return { ...(await encodeVariants(bitmap)), capturedAt };
	}
};

export type ImageWorkerApi = typeof api;

Comlink.expose(api);
