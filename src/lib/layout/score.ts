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

export function scoreCarousel(
	c: Carousel,
	photos: Map<PhotoId, LayoutPhoto>,
	preset: StylePreset
): ScoreResult {
	const W = stripWidth(c);
	const frames = c.frames.map((f) => ({ f, outer: frameOuter(f), inner: frameInner(f) }));
	const bgs = c.backgrounds.map((b) => ({
		b,
		rect: backgroundRect(b),
		photo: b.photoId ? photos.get(b.photoId) : undefined
	}));

	// Joins.
	const joins = c.backgrounds.slice(1).map((b) => b.x0);
	const edgeDistance = (x: number) => Math.min(x % SLIDE_W, SLIDE_W - (x % SLIDE_W));
	const offEdgeJoins = joins.filter((x) => edgeDistance(x) > 2);
	const covered = (x: number) =>
		frames.some(({ outer }) => x > outer.x + 8 && x < outer.x + outer.w - 8);
	const joinCovered = avg(
		offEdgeJoins.map((x) => (covered(x) ? 1 : 0)),
		0.5
	);
	const joinNearEdge = avg(
		joins.map((x) => {
			const d = edgeDistance(x);
			return d > 2 && d < preset.joinClearance && !covered(x) ? 1 - d / preset.joinClearance : 0;
		})
	);

	// Frames.
	const framePlacement = avg(
		frames.map(({ outer }) => {
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
			return Math.max(centred, 0.6 * straddle);
		}),
		0.5
	);

	// How much more of the backgrounds' "interesting" area a frame hides than an evenly
	// interesting picture would: 0 = no worse than average, 1 = it sits squarely on the subject.
	const frameCoversSubject = avg(
		frames.map(({ outer }) => {
			let excess = 0;
			let weight = 0;
			for (const { b, rect, photo } of bgs) {
				const overlap = photo && intersect(rect, outer);
				if (!overlap) continue;
				const s = saliencyIn(photo, rect, b.crop, outer);
				if (!s.total) continue;
				const share = s.inside / s.total;
				const areaShare = (overlap.w * overlap.h) / (rect.w * rect.h);
				excess += Math.max(0, share / areaShare - 1) * areaShare;
				weight += areaShare;
			}
			return weight ? Math.min(1, excess / weight) : 0;
		})
	);

	const contrast = avg(
		frames.map(({ f, outer }) => {
			const fp = photos.get(f.photoId);
			const cx = outer.x + outer.w / 2;
			const under = bgs.find(({ rect }) => cx >= rect.x && cx < rect.x + rect.w)?.photo;
			if (!fp || !under) return 0;
			if (fp.analysis.isMono !== under.analysis.isMono) return 1;
			return Math.min(1, Math.abs(fp.analysis.lumaMean - under.analysis.lumaMean) * 2) * 0.5;
		})
	);

	const frameHeight = avg(
		frames.map(({ f }) => distanceOutside(f.h / SLIDE_H, preset.frameHeight) * 3)
	);

	const bgSpan = avg(
		bgs.slice(1).map(({ rect, photo }) => {
			if (!photo) return 0;
			const a = photo.width / photo.height;
			const range =
				a > 1.15 ? preset.bgSpanLandscape : a < 0.87 ? preset.bgSpanPortrait : preset.bgSpanSquare;
			return Math.min(1, distanceOutside(rect.w / SLIDE_W, range));
		})
	);

	const lastX0 = W - SLIDE_W;
	const lastSlideCovered = Math.min(
		1,
		frames.reduce(
			(s, { outer }) => s + (overlapX(outer, lastX0, W) * outer.h) / (SLIDE_W * SLIDE_H),
			0
		) * 2
	);

	const upscale = avg([
		...bgs
			.filter((x) => x.photo)
			.map(({ b, rect, photo }) => Math.min(1, upscaleOf(photo!, rect, b.crop))),
		...frames.map(({ f, inner }) => {
			const p = photos.get(f.photoId);
			return p ? Math.min(1, upscaleOf(p, inner, f.crop)) : 0;
		})
	]);

	// Neighbours: consecutive backgrounds, and each frame with the background behind it.
	const neighbourPairs: [LayoutPhoto, LayoutPhoto][] = [];
	for (let i = 1; i < bgs.length; i++) {
		const a = bgs[i - 1].photo;
		const b = bgs[i].photo;
		if (a && b) neighbourPairs.push([a, b]);
	}
	for (const { f, outer } of frames) {
		const fp = photos.get(f.photoId);
		const cx = outer.x + outer.w / 2;
		const under = bgs.find(({ rect }) => cx >= rect.x && cx < rect.x + rect.w)?.photo;
		if (fp && under) neighbourPairs.push([fp, under]);
	}
	const adjacentDuplicate = avg(
		neighbourPairs.map(([a, b]) =>
			hammingDistance(a.analysis.dhash, b.analysis.dhash) <= NEAR_DUPLICATE_BITS ? 1 : 0
		)
	);
	const rhythm = avg(
		neighbourPairs.map(
			([a, b]) =>
				(a.analysis.isMono !== b.analysis.isMono ? 0.6 : 0) +
				(a.analysis.shot !== b.analysis.shot ? 0.4 : 0)
		),
		0.5
	);

	// A background's subject sliced by a slide edge it spans.
	const subjectCut = avg(
		bgs
			.filter((x) => x.photo)
			.map(({ b, rect, photo }) => {
				let worst = 0;
				const total = saliencyIn(photo!, rect, b.crop, rect).total || 1;
				for (let k = 1; k < c.slideCount; k++) {
					const edge = k * SLIDE_W;
					if (edge <= rect.x + 40 || edge >= rect.x + rect.w - 40) continue;
					const band = saliencyIn(photo!, rect, b.crop, { x: edge - 40, y: 0, w: 80, h: SLIDE_H });
					worst = Math.max(worst, band.inside / total / (80 / rect.w) - 1);
				}
				return Math.min(1, Math.max(0, worst) / 2);
			})
	);

	const terms: ScoreTerms = {
		joinCovered,
		joinNearEdge,
		framePlacement,
		frameCoversSubject,
		contrast,
		frameHeight,
		bgSpan,
		lastSlideCovered,
		upscale,
		adjacentDuplicate,
		rhythm,
		subjectCut
	};
	let total = 0;
	for (const key of Object.keys(terms) as (keyof ScoreWeights)[]) {
		total += (REWARDS.has(key) ? 1 : -1) * preset.weights[key] * terms[key];
	}
	return { total, terms };
}
