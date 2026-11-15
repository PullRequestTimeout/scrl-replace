/**
 * Scores a carousel layout against the style rules (PLAN.md §2). Each term is normalised to
 * roughly 0..1, then weighted by the preset: rewards add, penalties subtract.
 */
import { EXPORT_SCALE, SLIDE_H, SLIDE_W } from '#lib/model/constants.ts';
import {
	backgroundRect,
	cropSource,
	frameInner,
	frameOuter,
	stripWidth,
	type Carousel,
	type Crop,
	type Rect
} from '#lib/model/layout.ts';
import type { PhotoId } from '#lib/model/types.ts';
import type { ScoreWeights, StylePreset } from '#lib/model/presets.ts';
import { hammingDistance, NEAR_DUPLICATE_BITS } from '#lib/analysis/features.ts';
import type { LayoutPhoto } from './types.ts';

export type ScoreTerms = Record<keyof ScoreWeights, number>;

export interface ScoreResult {
	total: number;
	terms: ScoreTerms;
}

const REWARDS = new Set<keyof ScoreWeights>([
	'joinCovered',
	'framePlacement',
	'contrast',
	'rhythm'
]);

const avg = (xs: number[], empty = 0) =>
	xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : empty;

/**
 * Share of a photo's visible saliency (within `box` at `crop`) that falls inside `region`
 * (strip coordinates). Also returns the visible total so callers can weight.
 */
export function saliencyIn(
	photo: LayoutPhoto,
	box: Rect,
	crop: Crop,
	region: Rect
): { inside: number; total: number } {
	const map = photo.analysis.saliency.map;
	const src = cropSource(photo.width, photo.height, box.w, box.h, crop);
	let inside = 0;
	let total = 0;
	for (let gy = 0; gy < map.h; gy++) {
		const py = ((gy + 0.5) / map.h) * photo.height;
		if (py < src.y || py > src.y + src.h) continue;
		const sy = box.y + ((py - src.y) / src.h) * box.h;
		for (let gx = 0; gx < map.w; gx++) {
			const px = ((gx + 0.5) / map.w) * photo.width;
			if (px < src.x || px > src.x + src.w) continue;
			const sx = box.x + ((px - src.x) / src.w) * box.w;
			const v = map.values[gy * map.w + gx];
			total += v;
			if (
				sx >= region.x &&
				sx <= region.x + region.w &&
				sy >= region.y &&
				sy <= region.y + region.h
			)
				inside += v;
		}
	}
	return { inside, total };
}

const overlapX = (a: Rect, x0: number, x1: number) =>
	Math.max(0, Math.min(a.x + a.w, x1) - Math.max(a.x, x0));

function intersect(a: Rect, b: Rect): Rect | null {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const w = Math.min(a.x + a.w, b.x + b.w) - x;
	const h = Math.min(a.y + a.h, b.y + b.h) - y;
	return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * Share of a background frames may hide before it counts against a layout. One reference
 * post hides ~53% of a background, so the line sits just above that.
 */
export const HIDDEN_FREE = 0.55;

/**
 * The hidden share allowed for one background. With subject detection (or your tag), weak
 * backgrounds such as mist or a guest book may be covered more and strong ones less.
 */
export function hiddenFreeFor(p: LayoutPhoto | undefined): number {
	return p?.prominence === undefined ? HIDDEN_FREE : 0.75 - 0.35 * p.prominence;
}

/** How much covering a background's subject costs: 1 when nothing is known about it. */
export function subjectWeight(p: LayoutPhoto | undefined): number {
	return p?.prominence === undefined ? 1 : 0.3 + 1.4 * p.prominence;
}

/** Prominence at or above this counts as a strong subject. */
export const STRONG_SUBJECT = 0.6;

/** Share of `rect` covered by `covers` (frames don't overlap each other). */
export function hiddenShare(rect: Rect, covers: Rect[]): number {
	let area = 0;
	for (const c of covers) {
		const o = intersect(rect, c);
		if (o) area += o.w * o.h;
	}
	return area / (rect.w * rect.h);
}

/** How much a photo is enlarged past its stored copy at export size (0 = none). */
function upscaleOf(photo: LayoutPhoto, box: Rect, crop: Crop): number {
	const src = cropSource(photo.width, photo.height, box.w, box.h, crop);
	const srcWorkingPx = src.w * (photo.workingWidth / photo.width);
	const factor = (box.w * EXPORT_SCALE) / srcWorkingPx;
	return Math.max(0, factor - 1);
}

function distanceOutside(v: number, [lo, hi]: [number, number]) {
	return v < lo ? (lo - v) / lo : v > hi ? (v - hi) / hi : 0;
}

const edgeDistance = (x: number) => Math.min(x % SLIDE_W, SLIDE_W - (x % SLIDE_W));

/** Aspect bands for span ranges (shared with the generator's thresholds). */
export function spanRangeFor(photo: LayoutPhoto, preset: StylePreset): [number, number] {
	const a = photo.width / photo.height;
	return a > 1.15 ? preset.bgSpanLandscape : a < 0.87 ? preset.bgSpanPortrait : preset.bgSpanSquare;
}

/** Per-item measurements behind the score; the editor's live warnings read these too. */
export interface CarouselMeasures {
	joins: {
		x: number;
		/** Index of the background starting at this join. */
		index: number;
		/** Distance to the nearest slide edge (px). */
		edgeDistance: number;
		/** Hidden under a frame. */
		covered: boolean;
		/** 0..1: how far inside the clearance a visible join sits. */
		nearEdge: number;
	}[];
	frames: {
		id: string;
		placement: number;
		coversSubject: number;
		/** Like coversSubject, but only over backgrounds with a strong subject (R12 warning). */
		coversStrong: number;
		contrast: number;
		/** Both the frame and the background behind it have analysis (else contrast is 0). */
		compared: boolean;
		/** Distance outside the height range, ×3 (0 = inside). */
		heightOff: number;
		upscale: number;
	}[];
	backgrounds: {
		index: number;
		/** Share hidden by frames. */
		hidden: number;
		/** Share that may be hidden before it counts against the layout. */
		free: number;
		/** Distance outside the span range (null for the grid tile). */
		spanOff: number | null;
		/** Null without a photo. */
		subjectCut: number | null;
		upscale: number | null;
	}[];
	/** Consecutive backgrounds, and each frame with the background behind it. */
	pairs: { a: PhotoId; b: PhotoId; duplicate: boolean; rhythm: number }[];
	lastSlideCovered: number;
}

export function measureCarousel(
	c: Carousel,
	photos: Map<PhotoId, LayoutPhoto>,
	preset: StylePreset
): CarouselMeasures {
	const W = stripWidth(c);
	const frames = c.frames.map((f) => ({ f, outer: frameOuter(f), inner: frameInner(f) }));
	const bgs = c.backgrounds.map((b) => ({
		b,
		rect: backgroundRect(b),
		photo: b.photoId ? photos.get(b.photoId) : undefined
	}));
	const outers = frames.map(({ outer }) => outer);
	const underCentre = (outer: Rect) => {
		const cx = outer.x + outer.w / 2;
		return bgs.find(({ rect }) => cx >= rect.x && cx < rect.x + rect.w)?.photo;
	};

	// Joins.
	const covered = (x: number) =>
		frames.some(({ outer }) => x > outer.x + 8 && x < outer.x + outer.w - 8);
	const joins = c.backgrounds.slice(1).map((b, i) => {
		const x = b.x0;
		const d = edgeDistance(x);
		const isCovered = covered(x);
		const nearEdge =
			d > 2 && d < preset.joinClearance && !isCovered ? 1 - d / preset.joinClearance : 0;
		return { x, index: i + 1, edgeDistance: d, covered: isCovered, nearEdge };
	});

	const frameMeasures = frames.map(({ f, outer, inner }) => {
		const cx = outer.x + outer.w / 2;
		const slideCentre = (Math.floor(cx / SLIDE_W) + 0.5) * SLIDE_W;
		const centred = 1 - Math.min(1, Math.abs(cx - slideCentre) / (SLIDE_W / 4));
		let straddle = 0;
		for (let k = 1; k < c.slideCount; k++) {
			const edge = k * SLIDE_W;
			if (edge <= outer.x || edge >= outer.x + outer.w) continue;
			const side = Math.min(edge - outer.x, outer.x + outer.w - edge) / outer.w;
			straddle = Math.max(straddle, Math.min(1, side / 0.15));
		}
		const placement = Math.max(centred, 0.6 * straddle);

		// How much more of the backgrounds' "interesting" area a frame hides than an evenly
		// interesting picture would: 0 = no worse than average, 1 = it sits squarely on the subject.
		// Weighted by how strong each background's subject is, when that's known.
		let excess = 0;
		let weight = 0;
		let strongExcess = 0;
		let strongWeight = 0;
		for (const { b, rect, photo } of bgs) {
			const overlap = photo && intersect(rect, outer);
			if (!overlap) continue;
			const s = saliencyIn(photo, rect, b.crop, outer);
			if (!s.total) continue;
			const share = s.inside / s.total;
			const areaShare = (overlap.w * overlap.h) / (rect.w * rect.h);
			const e = Math.max(0, share / areaShare - 1) * areaShare;
			excess += e * subjectWeight(photo);
			weight += areaShare;
			if ((photo.prominence ?? 0) >= STRONG_SUBJECT) {
				strongExcess += e;
				strongWeight += areaShare;
			}
		}
		const coversSubject = weight ? Math.min(1, excess / weight) : 0;
		const coversStrong = strongWeight ? Math.min(1, strongExcess / strongWeight) : 0;

		const fp = photos.get(f.photoId);
		const under = underCentre(outer);
		const contrast =
			!fp || !under
				? 0
				: fp.analysis.isMono !== under.analysis.isMono
					? 1
					: Math.min(1, Math.abs(fp.analysis.lumaMean - under.analysis.lumaMean) * 2) * 0.5;

		return {
			id: f.id,
			placement,
			coversSubject,
			coversStrong,
			contrast,
			compared: !!fp && !!under,
			heightOff: distanceOutside(f.h / SLIDE_H, preset.frameHeight) * 3,
			upscale: fp ? Math.min(1, upscaleOf(fp, inner, f.crop)) : 0
		};
	});

	const backgrounds = bgs.map(({ b, rect, photo }, index) => {
		let subjectCut: number | null = null;
		if (photo) {
			// A background's subject sliced by a slide edge it spans.
			let worst = 0;
			const total = saliencyIn(photo, rect, b.crop, rect).total || 1;
			for (let k = 1; k < c.slideCount; k++) {
				const edge = k * SLIDE_W;
				if (edge <= rect.x + 40 || edge >= rect.x + rect.w - 40) continue;
				const band = saliencyIn(photo, rect, b.crop, { x: edge - 40, y: 0, w: 80, h: SLIDE_H });
				worst = Math.max(worst, band.inside / total / (80 / rect.w) - 1);
			}
			subjectCut = Math.min(1, Math.max(0, worst) / 2);
		}
		return {
			index,
			hidden: hiddenShare(rect, outers),
			free: hiddenFreeFor(photo),
			spanOff:
				index === 0
					? null
					: photo
						? Math.min(1, distanceOutside(rect.w / SLIDE_W, spanRangeFor(photo, preset)))
						: 0,
			subjectCut,
			upscale: photo ? Math.min(1, upscaleOf(photo, rect, b.crop)) : null
		};
	});

	const pairPhotos: [LayoutPhoto, LayoutPhoto][] = [];
	for (let i = 1; i < bgs.length; i++) {
		const a = bgs[i - 1].photo;
		const b = bgs[i].photo;
		if (a && b) pairPhotos.push([a, b]);
	}
	for (const { f, outer } of frames) {
		const fp = photos.get(f.photoId);
		const under = underCentre(outer);
		if (fp && under) pairPhotos.push([fp, under]);
	}
	const pairs = pairPhotos.map(([a, b]) => ({
		a: a.id,
		b: b.id,
		duplicate: hammingDistance(a.analysis.dhash, b.analysis.dhash) <= NEAR_DUPLICATE_BITS,
		rhythm:
			(a.analysis.isMono !== b.analysis.isMono ? 0.6 : 0) +
			(a.analysis.shot !== b.analysis.shot ? 0.4 : 0)
	}));

	const lastX0 = W - SLIDE_W;
	const lastSlideCovered = Math.min(
		1,
		frames.reduce(
			(s, { outer }) => s + (overlapX(outer, lastX0, W) * outer.h) / (SLIDE_W * SLIDE_H),
			0
		) * 2
	);

	return { joins, frames: frameMeasures, backgrounds, pairs, lastSlideCovered };
}

const notNull = <T>(x: T | null): x is T => x !== null;

export function scoreCarousel(
	c: Carousel,
	photos: Map<PhotoId, LayoutPhoto>,
	preset: StylePreset
): ScoreResult {
	const m = measureCarousel(c, photos, preset);
	const later = m.backgrounds.slice(1);

	const terms: ScoreTerms = {
		joinCovered: avg(
			m.joins.filter((j) => j.edgeDistance > 2).map((j) => (j.covered ? 1 : 0)),
			0.5
		),
		joinNearEdge: avg(m.joins.map((j) => j.nearEdge)),
		framePlacement: avg(
			m.frames.map((f) => f.placement),
			0.5
		),
		frameCoversSubject: avg(m.frames.map((f) => f.coversSubject)),
		// The worst-hidden background (not the grid tile): 0 up to its free share (55% unless
		// its subject strength is known), 1 by 30 points past that.
		backgroundHidden: Math.max(
			0,
			...later.map((b) => Math.min(1, Math.max(0, (b.hidden - b.free) / 0.3)))
		),
		contrast: avg(m.frames.map((f) => f.contrast)),
		frameHeight: avg(m.frames.map((f) => f.heightOff)),
		bgSpan: avg(later.map((b) => b.spanOff ?? 0)),
		lastSlideCovered: m.lastSlideCovered,
		upscale: avg([
			...m.backgrounds.map((b) => b.upscale).filter(notNull),
			...m.frames.map((f) => f.upscale)
		]),
		adjacentDuplicate: avg(m.pairs.map((p) => (p.duplicate ? 1 : 0))),
		rhythm: avg(
			m.pairs.map((p) => p.rhythm),
			0.5
		),
		subjectCut: avg(m.backgrounds.map((b) => b.subjectCut).filter(notNull))
	};
	let total = 0;
	for (const key of Object.keys(terms) as (keyof ScoreWeights)[]) {
		total += (REWARDS.has(key) ? 1 : -1) * preset.weights[key] * terms[key];
	}
	return { total, terms };
}
