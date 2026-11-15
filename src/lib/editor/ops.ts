/**
 * Pure editing operations on a carousel. Each returns a new carousel (inputs are never
 * mutated), so the editor can keep undo snapshots and the logic is unit-testable.
 */
import { SLIDE_H, SLIDE_W } from '#lib/model/constants.ts';
import {
	CENTRED,
	clamp,
	DEFAULT_BORDER_RATIO,
	frameWidth,
	stripWidth,
	type Background,
	type Carousel,
	type Crop,
	type Frame
} from '#lib/model/layout.ts';
import type { PhotoId } from '#lib/model/types.ts';

/** Narrowest a background may get when moving a join or splitting. */
export const MIN_BG_WIDTH = 160;
export const MIN_FRAME_H = 200;
/** R10: frames stay at least this far from the top and bottom edges when snapping. */
export const FRAME_MARGIN = 40;

const clone = (c: Carousel): Carousel => structuredClone(c);

export function newFrameId(): string {
	return crypto.randomUUID();
}

/**
 * A blank carousel for building by hand: slide 1 is its own empty slot for the grid tile
 * (a single portrait photo), and one empty background covers the rest.
 */
export function blankCarousel(slideCount = 3): Carousel {
	const slot = (x0: number, x1: number): Background => ({
		photoId: null,
		x0,
		x1,
		crop: { ...CENTRED }
	});
	return {
		slideCount,
		backgrounds:
			slideCount > 1 ? [slot(0, SLIDE_W), slot(SLIDE_W, slideCount * SLIDE_W)] : [slot(0, SLIDE_W)],
		frames: []
	};
}

// ---------------------------------------------------------------------------
// Frames

/** Keep a frame inside the strip and the slide height. */
export function clampFrame(c: Carousel, f: Frame): Frame {
	const w = frameWidth(f);
	const h = Math.min(f.h, SLIDE_H);
	return {
		...f,
		h,
		x: clamp(f.x, 0, Math.max(0, stripWidth(c) - w)),
		y: clamp(f.y, 0, SLIDE_H - h)
	};
}

export function updateFrame(c: Carousel, id: string, patch: Partial<Frame>): Carousel {
	const next = clone(c);
	const i = next.frames.findIndex((f) => f.id === id);
	if (i < 0) return c;
	next.frames[i] = clampFrame(next, { ...next.frames[i], ...patch });
	return next;
}

export function moveFrame(c: Carousel, id: string, x: number, y: number): Carousel {
	return updateFrame(c, id, { x, y });
}

/**
 * Resize keeping the photo shape, anchored at a corner. The border scales with the frame
 * so it stays the same proportion (it's ~3% of height in the reference posts).
 */
export function resizeFrame(
	c: Carousel,
	id: string,
	newH: number,
	anchor: { x: number; y: number; corner: 'tl' | 'tr' | 'bl' | 'br' }
): Carousel {
	const f = c.frames.find((fr) => fr.id === id);
	if (!f) return c;
	const h = clamp(newH, MIN_FRAME_H, SLIDE_H);
	const border = f.h > 0 ? Math.round((f.border / f.h) * h) : f.border;
	const w = frameWidth({ h, aspect: f.aspect, border });
	// The anchor is the corner that stays put (opposite the dragged one).
	const x = anchor.corner === 'tl' || anchor.corner === 'bl' ? anchor.x : anchor.x - w;
	const y = anchor.corner === 'tl' || anchor.corner === 'tr' ? anchor.y : anchor.y - h;
	return updateFrame(c, id, { h, border, x, y });
}

export function setFrameCrop(c: Carousel, id: string, crop: Crop): Carousel {
	return updateFrame(c, id, { crop });
}

/** Change the frame's photo shape, keeping its height and centre. */
export function setFrameAspect(c: Carousel, id: string, aspect: number): Carousel {
	const f = c.frames.find((fr) => fr.id === id);
	if (!f) return c;
	const cx = f.x + frameWidth(f) / 2;
	const w = frameWidth({ ...f, aspect });
	return updateFrame(c, id, { aspect, x: cx - w / 2, crop: { ...f.crop, zoom: 1 } });
}

export function setFrameBorder(c: Carousel, id: string, border: number): Carousel {
	const f = c.frames.find((fr) => fr.id === id);
	if (!f) return c;
	const b = clamp(Math.round(border), 0, Math.floor(f.h / 4));
	// Keep the centre where it was as the width changes.
	const cx = f.x + frameWidth(f) / 2;
	return updateFrame(c, id, { border: b, x: cx - frameWidth({ ...f, border: b }) / 2 });
}

/** Add a frame centred at `cx` (strip px), 60% of the slide height, vertically centred. */
export function addFrame(c: Carousel, photoId: PhotoId, photoAspect: number, cx: number): Carousel {
	const h = Math.round(SLIDE_H * 0.6);
	const border = Math.round(h * DEFAULT_BORDER_RATIO);
	const frame: Frame = {
		id: newFrameId(),
		photoId,
		h,
		border,
		aspect: photoAspect,
		x: 0,
		y: Math.round((SLIDE_H - h) / 2),
		crop: { ...CENTRED }
	};
	frame.x = cx - frameWidth(frame) / 2;
	const next = clone(c);
	next.frames.push(clampFrame(next, frame));
	return next;
}

export function deleteFrame(c: Carousel, id: string): Carousel {
	const next = clone(c);
	next.frames = next.frames.filter((f) => f.id !== id);
	return next;
}

/** Move a frame one step up or down the stacking order. */
export function restackFrame(c: Carousel, id: string, direction: 1 | -1): Carousel {
	const i = c.frames.findIndex((f) => f.id === id);
	const j = i + direction;
	if (i < 0 || j < 0 || j >= c.frames.length) return c;
	const next = clone(c);
	[next.frames[i], next.frames[j]] = [next.frames[j], next.frames[i]];
	return next;
}

// ---------------------------------------------------------------------------
// Backgrounds

/** Index of the background covering strip x. */
export function backgroundAt(c: Carousel, x: number): number {
	const i = c.backgrounds.findIndex((b) => x >= b.x0 && x < b.x1);
	return i >= 0 ? i : c.backgrounds.length - 1;
}

/** Allowed range for the join between background i-1 and i. Slide 1 always stays one photo (R3). */
export function joinRange(c: Carousel, i: number): [number, number] {
	const left = c.backgrounds[i - 1];
	const right = c.backgrounds[i];
	const lo = Math.max(left.x0 + MIN_BG_WIDTH, i === 1 ? SLIDE_W : 0);
	const hi = right.x1 - MIN_BG_WIDTH;
	return [lo, Math.max(lo, hi)];
}

export function moveJoin(c: Carousel, i: number, x: number): Carousel {
	if (i <= 0 || i >= c.backgrounds.length) return c;
	const [lo, hi] = joinRange(c, i);
	const at = Math.round(clamp(x, lo, hi));
	const next = clone(c);
	next.backgrounds[i - 1].x1 = at;
	next.backgrounds[i].x0 = at;
	return next;
}

export function setBackgroundCrop(c: Carousel, i: number, crop: Crop): Carousel {
	const next = clone(c);
	if (!next.backgrounds[i]) return c;
	next.backgrounds[i].crop = crop;
	return next;
}

export function setBackgroundPhoto(c: Carousel, i: number, photoId: PhotoId): Carousel {
	const next = clone(c);
	if (!next.backgrounds[i]) return c;
	next.backgrounds[i] = { ...next.backgrounds[i], photoId, crop: { ...CENTRED } };
	return next;
}

/** Remove a background; its neighbour (left, or right for the first) takes its space. */
export function deleteBackground(c: Carousel, i: number): Carousel {
	if (c.backgrounds.length <= 1) {
		// Last one: keep the slot, just empty it.
		const next = clone(c);
		next.backgrounds[0] = { ...next.backgrounds[0], photoId: null, crop: { ...CENTRED } };
		return next;
	}
	const next = clone(c);
	const [removed] = next.backgrounds.splice(i, 1);
	if (i === 0) next.backgrounds[0].x0 = 0;
	else next.backgrounds[i - 1].x1 = removed.x1;
	return next;
}

/**
 * Split background i at x, putting `photoId` on the right part. If either part would be
 * narrower than the minimum, the whole background gets the photo instead.
 */
export function splitBackground(
	c: Carousel,
	i: number,
	x: number,
	photoId: PhotoId | null
): Carousel {
	const b = c.backgrounds[i];
	if (!b) return c;
	const lo = Math.max(b.x0 + MIN_BG_WIDTH, i === 0 ? SLIDE_W : 0);
	const hi = b.x1 - MIN_BG_WIDTH;
	if (lo > hi) return photoId ? setBackgroundPhoto(c, i, photoId) : c;
	const at = Math.round(clamp(x, lo, hi));
	const next = clone(c);
	const right: Background = { photoId, x0: at, x1: b.x1, crop: { ...CENTRED } };
	next.backgrounds[i] = { ...b, x1: at };
	next.backgrounds.splice(i + 1, 0, right);
	return next;
}

// ---------------------------------------------------------------------------
// Converting and swapping

/** Turn a frame into a background: split the background under its centre there. */
export function frameToBackground(c: Carousel, id: string): Carousel {
	const f = c.frames.find((fr) => fr.id === id);
	if (!f) return c;
	const cx = f.x + frameWidth(f) / 2;
	const without = deleteFrame(c, id);
	return splitBackground(without, backgroundAt(without, cx), cx, f.photoId);
}

/** Turn a background into a frame centred on it; its neighbour fills the gap. */
export function backgroundToFrame(c: Carousel, i: number, photoAspect: number): Carousel {
	const b = c.backgrounds[i];
	if (!b?.photoId) return c;
	const cx = (b.x0 + b.x1) / 2;
	if (c.backgrounds.length <= 1) return c; // nothing would be left behind it
	return addFrame(deleteBackground(c, i), b.photoId, photoAspect, cx);
}

export type ElementRef = { kind: 'frame'; id: string } | { kind: 'bg'; index: number };

function photoOf(c: Carousel, ref: ElementRef): PhotoId | null | undefined {
	return ref.kind === 'frame'
		? c.frames.find((f) => f.id === ref.id)?.photoId
		: c.backgrounds[ref.index]?.photoId;
}

/**
 * Put `photoId` on an element. Frames take the new photo's shape (keeping height and centre);
 * crops reset because the old focus point means nothing for a different photo.
 */
export function replacePhoto(
	c: Carousel,
	ref: ElementRef,
	photoId: PhotoId,
	photoAspect: number
): Carousel {
	if (ref.kind === 'bg') return setBackgroundPhoto(c, ref.index, photoId);
	const f = c.frames.find((fr) => fr.id === ref.id);
	if (!f) return c;
	const withAspect = setFrameAspect(c, ref.id, photoAspect);
	return updateFrame(withAspect, ref.id, { photoId, crop: { ...CENTRED } });
}

/** Swap the photos of two elements. */
export function swapPhotos(
	c: Carousel,
	a: ElementRef,
	b: ElementRef,
	aspectOf: (id: PhotoId) => number
): Carousel {
	const pa = photoOf(c, a);
	const pb = photoOf(c, b);
	if (!pa || !pb) return c;
	return replacePhoto(replacePhoto(c, a, pb, aspectOf(pb)), b, pa, aspectOf(pa));
}

// ---------------------------------------------------------------------------
// Slides

export function addSlide(c: Carousel): Carousel {
	const next = clone(c);
	next.slideCount += 1;
	next.backgrounds[next.backgrounds.length - 1].x1 = stripWidth(next);
	return next;
}

/** Remove the last slide. Backgrounds past the end go; frames are pulled back inside. */
export function removeSlide(c: Carousel): Carousel {
	if (c.slideCount <= 1) return c;
	const next = clone(c);
	next.slideCount -= 1;
	const W = stripWidth(next);
	next.backgrounds = next.backgrounds.filter((b) => b.x0 < W - MIN_BG_WIDTH / 2 || b.x0 === 0);
	next.backgrounds[next.backgrounds.length - 1].x1 = W;
	next.frames = next.frames.map((f) => clampFrame(next, f));
	return next;
}

// ---------------------------------------------------------------------------
// Snapping

export interface SnapResult {
	x: number;
	y: number;
	guides: { axis: 'x' | 'y'; at: number }[];
}

/**
 * Snap a frame being dragged. Its centre snaps to slide edges and background joins
 * (where frames sit in the reference posts); vertically to the slide centre and the
 * top/bottom margins. `threshold` is in strip px.
 */
export function snapFrame(
	c: Carousel,
	f: Frame,
	x: number,
	y: number,
	threshold: number
): SnapResult {
	const w = frameWidth(f);
	const guides: SnapResult['guides'] = [];

	const xTargets = [
		...Array.from({ length: c.slideCount - 1 }, (_, i) => (i + 1) * SLIDE_W),
		...c.backgrounds.slice(1).map((b) => b.x0)
	];
	const cx = x + w / 2;
	let bestX: number | null = null;
	for (const t of xTargets) {
		if (
			Math.abs(cx - t) <= threshold &&
			(bestX === null || Math.abs(cx - t) < Math.abs(cx - bestX))
		)
			bestX = t;
	}
	if (bestX !== null) {
		x = bestX - w / 2;
		guides.push({ axis: 'x', at: bestX });
	}

	const yCandidates: { at: number; y: number }[] = [
		{ at: SLIDE_H / 2, y: SLIDE_H / 2 - f.h / 2 },
		{ at: FRAME_MARGIN, y: FRAME_MARGIN },
		{ at: SLIDE_H - FRAME_MARGIN, y: SLIDE_H - FRAME_MARGIN - f.h }
	];
	let bestY: (typeof yCandidates)[number] | null = null;
	for (const cand of yCandidates) {
		const d = Math.abs(y - cand.y);
		if (d <= threshold && (!bestY || d < Math.abs(y - bestY.y))) bestY = cand;
	}
	if (bestY) {
		y = bestY.y;
		guides.push({ axis: 'y', at: bestY.at });
	}
	return { x, y, guides };
}

/** Snap a background join to the nearest slide edge within `threshold`. */
export function snapJoin(x: number, threshold: number): { x: number; snapped: boolean } {
	const edge = Math.round(x / SLIDE_W) * SLIDE_W;
	return Math.abs(x - edge) <= threshold ? { x: edge, snapped: true } : { x, snapped: false };
}
