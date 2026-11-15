import { SLIDE_H, SLIDE_W } from '#lib/model/constants.ts';
import type { PhotoId } from '#lib/model/types.ts';
import {
	backgroundRect,
	cropSource,
	frameInner,
	frameOuter,
	intersects,
	type Carousel,
	type Crop,
	type Rect
} from '#lib/model/layout.ts';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A decoded image plus the original photo size the crop maths refers to. */
export interface DrawSource {
	image: CanvasImageSource;
	/** Pixel size of `image` (may be a downscaled copy of the original). */
	imageW: number;
	imageH: number;
	/** Original photo size, so crops are resolution independent. */
	photoW: number;
	photoH: number;
}

export type SourceLookup = (photoId: PhotoId) => DrawSource | undefined;

export interface DrawOptions {
	/** Strip x (output px) at the canvas's left edge. */
	originX: number;
	/** Canvas px per output px. */
	scale: number;
	/** Fill used where an image isn't loaded yet. */
	placeholder?: string;
	/** Fill for backgrounds with no photo (the style's empty background colour). */
	emptyFill?: string;
	borderColor?: string;
}

/**
 * Draw the part of a carousel strip that falls on the canvas. One function for the on-screen
 * preview and the 1:1 export, so what you see is exactly what gets saved.
 */
export function drawCarousel(
	ctx: Ctx2D,
	carousel: Carousel,
	lookup: SourceLookup,
	opts: DrawOptions
) {
	const {
		originX,
		scale,
		placeholder = '#262626',
		emptyFill = '#ffffff',
		borderColor = '#ffffff'
	} = opts;
	const viewW = ctx.canvas.width / scale;
	const x0 = originX;
	const x1 = originX + viewW;

	ctx.save();
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.setTransform(scale, 0, 0, scale, -originX * scale, 0);

	for (const bg of carousel.backgrounds) {
		const r = backgroundRect(bg);
		if (!intersects(r, x0, x1)) continue;
		drawPhoto(
			ctx,
			bg.photoId ? lookup(bg.photoId) : undefined,
			r,
			bg.crop,
			bg.photoId ? placeholder : emptyFill,
			scale
		);
	}

	for (const frame of carousel.frames) {
		const outer = frameOuter(frame);
		if (!intersects(outer, x0, x1)) continue;
		ctx.fillStyle = borderColor;
		ctx.fillRect(outer.x, outer.y, outer.w, outer.h);
		drawPhoto(ctx, lookup(frame.photoId), frameInner(frame), frame.crop, placeholder, scale);
	}

	ctx.restore();
}

function drawPhoto(
	ctx: Ctx2D,
	source: DrawSource | undefined,
	box: Rect,
	crop: Crop,
	placeholder: string,
	scale: number
) {
	// Snap box edges to whole canvas pixels so neighbouring photos meet without hairline gaps.
	const snap = (v: number) => Math.round(v * scale) / scale;
	const bx = snap(box.x);
	const by = snap(box.y);
	const bw = snap(box.x + box.w) - bx;
	const bh = snap(box.y + box.h) - by;

	if (!source) {
		ctx.fillStyle = placeholder;
		ctx.fillRect(bx, by, bw, bh);
		return;
	}
	const src = cropSource(source.photoW, source.photoH, box.w, box.h, crop);
	const kx = source.imageW / source.photoW;
	const ky = source.imageH / source.photoH;
	ctx.drawImage(source.image, src.x * kx, src.y * ky, src.w * kx, src.h * ky, bx, by, bw, bh);
}

/** Canvas size for one slide at a given scale. */
export function slideCanvasSize(scale: number) {
	return { width: Math.round(SLIDE_W * scale), height: Math.round(SLIDE_H * scale) };
}
