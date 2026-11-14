import type { PhotoId } from './types.ts';
import { SLIDE_H, SLIDE_W } from './constants.ts';

/**
 * How a photo fills a box: like CSS `object-fit: cover`, plus a focus point and zoom.
 * `fx`/`fy` (0..1) are the point of the photo kept at the box centre where possible;
 * `zoom` (>= 1) scales beyond the cover fit.
 */
export interface Crop {
	fx: number;
	fy: number;
	zoom: number;
}

export const CENTRED: Crop = { fx: 0.5, fy: 0.5, zoom: 1 };

/** Full-height background photo spanning strip pixels [x0, x1). A null photo is an empty slot (hand-built layouts). */
export interface Background {
	photoId: PhotoId | null;
	x0: number;
	x1: number;
	crop: Crop;
}

/** White-bordered photo placed over the backgrounds. Coordinates are the outer box. */
export interface Frame {
	id: string;
	photoId: PhotoId;
	x: number;
	y: number;
	/** Outer height including the border. Width follows from `aspect` and `border`. */
	h: number;
	/** Inner (photo area) width / height. The photo's own aspect unless cropped. */
	aspect: number;
	border: number;
	crop: Crop;
}

export interface Carousel {
	slideCount: number;
	/** Sorted, contiguous, covering [0, slideCount × SLIDE_W). Background 0 is the grid tile. */
	backgrounds: Background[];
	/** Drawn in array order (later = on top). */
	frames: Frame[];
}

export const stripWidth = (c: Carousel) => c.slideCount * SLIDE_W;

/** Default border: about 3% of the frame's outer height (measured from the reference posts). */
export const DEFAULT_BORDER_RATIO = 0.03;

export function frameWidth(f: Pick<Frame, 'h' | 'aspect' | 'border'>): number {
	return (f.h - 2 * f.border) * f.aspect + 2 * f.border;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function frameInner(f: Frame): Rect {
	return {
		x: f.x + f.border,
		y: f.y + f.border,
		w: frameWidth(f) - 2 * f.border,
		h: f.h - 2 * f.border
	};
}

export function frameOuter(f: Frame): Rect {
	return { x: f.x, y: f.y, w: frameWidth(f), h: f.h };
}

export function backgroundRect(b: Background): Rect {
	return { x: b.x0, y: 0, w: b.x1 - b.x0, h: SLIDE_H };
}

/**
 * The source rectangle (in photo pixels) shown in a box of `boxW × boxH` for a crop.
 * The focus point is clamped so the rectangle never leaves the photo.
 */
export function cropSource(
	photoW: number,
	photoH: number,
	boxW: number,
	boxH: number,
	crop: Crop
): Rect {
	const scale = Math.max(boxW / photoW, boxH / photoH) * Math.max(1, crop.zoom);
	const w = Math.min(photoW, boxW / scale);
	const h = Math.min(photoH, boxH / scale);
	const cx = clamp(crop.fx * photoW, w / 2, photoW - w / 2);
	const cy = clamp(crop.fy * photoH, h / 2, photoH - h / 2);
	return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const intersects = (a: Rect, x0: number, x1: number) => a.x < x1 && a.x + a.w > x0;

/** Structural problems that would make a layout unrenderable (not style rules). */
export function structuralErrors(c: Carousel): string[] {
	const errors: string[] = [];
	const W = stripWidth(c);
	if (!Number.isInteger(c.slideCount) || c.slideCount < 1)
		errors.push('slideCount must be a positive integer');
	if (!c.backgrounds.length) errors.push('no backgrounds');
	let x = 0;
	for (const b of c.backgrounds) {
		if (Math.abs(b.x0 - x) > 0.5) errors.push(`gap or overlap at x=${x}`);
		if (b.x1 <= b.x0) errors.push(`empty background at x=${b.x0}`);
		x = b.x1;
	}
	if (Math.abs(x - W) > 0.5) errors.push(`backgrounds end at ${x}, strip is ${W}`);
	for (const f of c.frames) {
		const o = frameOuter(f);
		if (o.y < 0 || o.y + o.h > SLIDE_H) errors.push(`frame ${f.id} leaves the slide vertically`);
		if (o.x < 0 || o.x + o.w > W) errors.push(`frame ${f.id} leaves the strip`);
	}
	return errors;
}

/** Which slides (0-based) an element overlaps. */
export function slidesTouched(r: Rect): number[] {
	const first = Math.floor(r.x / SLIDE_W);
	const last = Math.floor((r.x + r.w - 0.001) / SLIDE_W);
	return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** Every photo a carousel uses, in strip order. */
export function photosIn(c: Carousel): PhotoId[] {
	return [
		...c.backgrounds.flatMap((b) => (b.photoId ? [b.photoId] : [])),
		...c.frames.map((f) => f.photoId)
	];
}

/** True when every background has a photo, so the carousel can be exported. */
export const isComplete = (c: Carousel) => c.backgrounds.every((b) => b.photoId !== null);
