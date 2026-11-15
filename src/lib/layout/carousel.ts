/**
 * Generates carousel layouts in your style (PLAN.md §6.4): choose roles, order for flow, size
 * the backgrounds, then place frames over joins at slide edges where they hide the least of
 * what's behind them. Many seeded candidates are scored and a few good, varied ones returned.
 */
import { SLIDE_H, SLIDE_W } from '#lib/model/constants.ts';
import {
	CENTRED,
	cropSource,
	frameOuter,
	frameWidth,
	maxBackgroundWidth,
	structuralErrors,
	type Background,
	type Carousel,
	type Crop,
	type Frame
} from '#lib/model/layout.ts';
import type { PhotoId } from '#lib/model/types.ts';
import type { StylePreset } from '#lib/model/presets.ts';
import { hammingDistance, NEAR_DUPLICATE_BITS } from '#lib/analysis/features.ts';
import { rng, type Rng } from './rng.ts';
import {
	hiddenFreeFor,
	hiddenShare,
	saliencyIn,
	scoreCarousel,
	subjectWeight,
	type ScoreResult
} from './score.ts';
import { aspectOf, type LayoutPhoto } from './types.ts';

export interface CarouselInput {
	/** Slide 1: the grid tile, fixed by the row choice. */
	tile: Background;
	/** The other photos for this carousel. */
	photos: LayoutPhoto[];
	/** Every photo involved (including the tile photo), for scoring. */
	photoMap: Map<PhotoId, LayoutPhoto>;
	preset: StylePreset;
}

export interface Suggestion {
	carousel: Carousel;
	score: ScoreResult;
	seed: number;
}

export const MAX_SLIDES = 10;
const MIN_BG = 300;

function spanRange(p: LayoutPhoto, preset: StylePreset): [number, number] {
	const a = aspectOf(p);
	return a > 1.15 ? preset.bgSpanLandscape : a < 0.87 ? preset.bgSpanPortrait : preset.bgSpanSquare;
}

/**
 * Scale desired widths to sum to `target` without any exceeding its cap. Shrinking is always
 * possible; growing only goes to backgrounds with room. Returns null if the target can't be
 * reached (too few uncapped backgrounds), so the caller can use one slide fewer.
 */
export function distributeWidths(
	desired: number[],
	caps: number[],
	target: number
): number[] | null {
	const w = [...desired];
	let total = w.reduce((a, b) => a + b, 0);
	if (total > target) {
		const k = target / total;
		for (let i = 0; i < w.length; i++) w[i] = Math.max(MIN_BG, w[i] * k);
		total = w.reduce((a, b) => a + b, 0);
	}
	let diff = target - total;
	for (let guard = 0; Math.abs(diff) > 0.5 && guard < 50; guard++) {
		if (diff > 0) {
			const room = w.map((v, i) => (caps[i] - v > 0.5 ? i : -1)).filter((i) => i >= 0);
			if (!room.length) return null;
			const share = diff / room.length;
			for (const i of room) {
				const add = Math.min(share, caps[i] - w[i]);
				w[i] += add;
				diff -= add;
			}
		} else {
			const k = (total + diff) / total;
			for (let i = 0; i < w.length; i++) w[i] *= k;
			diff = 0;
		}
		total = w.reduce((a, b) => a + b, 0);
	}
	return w.map((v) => Math.round(v));
}

/** Order photos with time when every photo has it, otherwise import order. */
function baseOrder(photos: LayoutPhoto[]): LayoutPhoto[] {
	const timed = photos.every((p) => p.capturedAt !== undefined);
	return [...photos].sort((a, b) =>
		timed
			? a.capturedAt! - b.capturedAt! || a.importIndex - b.importIndex
			: a.importIndex - b.importIndex
	);
}

const isDup = (a: LayoutPhoto, b: LayoutPhoto) =>
	hammingDistance(a.analysis.dhash, b.analysis.dhash) <= NEAR_DUPLICATE_BITS;

/** Greedy flow: alternate colour/B&W and shot types, avoid near-duplicates side by side. */
function flowOrder(photos: LayoutPhoto[], first: LayoutPhoto | undefined, r: Rng): LayoutPhoto[] {
	const pool = baseOrder(photos);
	const out: LayoutPhoto[] = [];
	let prev = first;
	while (pool.length) {
		let bestI = 0;
		let best = -Infinity;
		pool.forEach((p, i) => {
			let s = -i * 0.08; // keep roughly to the base order
			if (prev) {
				if (p.analysis.isMono !== prev.analysis.isMono) s += 0.6;
				if (p.analysis.shot !== prev.analysis.shot) s += 0.4;
				if (isDup(p, prev)) s -= 2;
			}
			s += r.range(0, 0.7);
			if (s > best) [best, bestI] = [s, i];
		});
		prev = pool.splice(bestI, 1)[0];
		out.push(prev);
	}
	return out;
}

/** Background crop centred on the photo's subject. */
const subjectCrop = (p: LayoutPhoto): Crop => ({
	fx: p.analysis.saliency.cx,
	fy: p.analysis.saliency.cy,
	zoom: 1
});

/** Shift `crop.fy` so the photo's horizon lands at `targetY` (box px), if it can. */
function alignHorizon(p: LayoutPhoto, boxW: number, crop: Crop, targetY: number): Crop {
	const hy = p.analysis.horizonY;
	if (hy === null) return crop;
	const src = cropSource(p.width, p.height, boxW, SLIDE_H, crop);
	const srcY = hy * p.height - (targetY / SLIDE_H) * src.h;
	return { ...crop, fy: (srcY + src.h / 2) / p.height };
}

function horizonBoxY(p: LayoutPhoto, boxW: number, crop: Crop): number | null {
	const hy = p.analysis.horizonY;
	if (hy === null) return null;
	const src = cropSource(p.width, p.height, boxW, SLIDE_H, crop);
	const y = ((hy * p.height - src.y) / src.h) * SLIDE_H;
	return y > 0 && y < SLIDE_H ? y : null;
}

export function generateCarousel(input: CarouselInput, seed: number): Carousel | null {
	const { tile, photos, preset } = input;
	const r = rng(seed);
	const tilePhoto = tile.photoId ? input.photoMap.get(tile.photoId) : undefined;
	const tileBg: Background = { ...tile, x0: 0, x1: SLIDE_W };

	if (photos.length === 0) return { slideCount: 1, backgrounds: [tileBg], frames: [] };

	// 1. Roles: about a third become frames; at least one background follows the tile.
	const n = photos.length;
	const frameCount = Math.max(0, Math.min(n - 1, Math.round(n / 3) + r.pick([-1, 0, 0, 1])));
	// Portraits lean towards frames and landscapes towards backgrounds, where they work best.
	const propensity = (p: LayoutPhoto) => {
		const a = aspectOf(p);
		let s = a < 0.87 ? 0.4 : a < 1.15 ? 0.2 : -0.3;
		if (p.analysis.shot === 'close') s += 0.2;
		if (p.workingWidth < 2400) s += 0.3; // small photos look better small
		// Strong subjects lean towards frames, which are never covered; background material
		// (mist, textures) towards backgrounds that frames sit on. A nudge, not a rule.
		if (p.prominence !== undefined) s += (p.prominence - 0.5) * 0.6;
		return s + r.range(0, 0.8);
	};
	const ranked = [...photos].sort((a, b) => propensity(b) - propensity(a));
	const framePhotos = ranked.slice(0, frameCount);
	const bgPhotos = flowOrder(ranked.slice(frameCount), tilePhoto, r);

	// 2. Background spans, fitted to a whole number of slides. Portrait backgrounds never grow
	// past their natural width at full height, so only the others absorb extra space.
	const caps = bgPhotos.map((p) => maxBackgroundWidth(p.width, p.height));
	const desired = bgPhotos.map((p, i) => {
		const [lo, hi] = spanRange(p, preset);
		return Math.min(caps[i], r.range(lo, hi) * SLIDE_W);
	});
	let slideCount = Math.max(
		2,
		Math.min(MAX_SLIDES, Math.round(desired.reduce((a, b) => a + b, 0) / SLIDE_W) + 1)
	);
	let widths = distributeWidths(desired, caps, (slideCount - 1) * SLIDE_W);
	while (!widths && slideCount > 2) {
		slideCount -= 1;
		widths = distributeWidths(desired, caps, (slideCount - 1) * SLIDE_W);
	}
	if (!widths) return null;
	const backgrounds: Background[] = [tileBg];
	let x = SLIDE_W;
	bgPhotos.forEach((p, i) => {
		const w = i === bgPhotos.length - 1 ? slideCount * SLIDE_W - x : widths[i];
		backgrounds.push({ photoId: p.id, x0: x, x1: x + w, crop: subjectCrop(p) });
		x += w;
	});
	const W = slideCount * SLIDE_W;
	const capOf = (b: Background) => {
		const p = b.photoId ? input.photoMap.get(b.photoId) : undefined;
		return p ? maxBackgroundWidth(p.width, p.height) : Infinity;
	};
	/** Where the join before background i may go, keeping minimum widths and portrait caps. */
	const joinLimits = (i: number): [number, number] => {
		const left = backgrounds[i - 1];
		const right = backgrounds[i];
		return [
			Math.max(left.x0 + MIN_BG, right.x1 - capOf(right)),
			Math.min(right.x1 - MIN_BG, left.x0 + capOf(left))
		];
	};

	// 3. Frames. Measured from the reference posts: most frames are centred on one slide
	// (both ways, ~75–88% of its height) with a background join hidden underneath; now and
	// then a smaller frame sits off-centre across a slide edge.
	const frames: Frame[] = [];
	const gap = preset.frameGap * SLIDE_W;
	const borderFor = (hh: number) => Math.round(hh * preset.borderRatio);
	const bgUnder = (cx: number) => backgrounds.find((b) => cx >= b.x0 && cx < b.x1);
	const photoOf = (b: Background) => (b.photoId ? input.photoMap.get(b.photoId) : undefined);
	/** Share of each background's subject a rect would hide, weighted by subject strength. */
	const coveredSaliency = (rect: { x: number; y: number; w: number; h: number }) => {
		let s = 0;
		for (const b of backgrounds) {
			const p = photoOf(b);
			if (!p || rect.x >= b.x1 || rect.x + rect.w <= b.x0) continue;
			const box = { x: b.x0, y: 0, w: b.x1 - b.x0, h: SLIDE_H };
			const { inside, total } = saliencyIn(p, box, b.crop, rect);
			s += total ? (inside / total) * subjectWeight(p) : 0;
		}
		return s;
	};
	/** Like coveredSaliency, but only counting backgrounds known to have a strong subject. */
	const subjectRisk = (rect: { x: number; y: number; w: number; h: number }) => {
		let s = 0;
		for (const b of backgrounds) {
			const p = photoOf(b);
			if (p?.prominence === undefined || rect.x >= b.x1 || rect.x + rect.w <= b.x0) continue;
			const box = { x: b.x0, y: 0, w: b.x1 - b.x0, h: SLIDE_H };
			const { inside, total } = saliencyIn(p, box, b.crop, rect);
			s += total ? (inside / total) * Math.max(0, p.prominence - 0.3) : 0;
		}
		return s;
	};
	/** How far past the free share a new frame would leave the worst-hidden background. */
	const buries = (rect: { x: number; y: number; w: number; h: number }) => {
		const covers = [...frames.map(frameOuter), rect];
		let worst = 0;
		for (const b of backgrounds.slice(1)) {
			if (rect.x >= b.x1 || rect.x + rect.w <= b.x0) continue;
			const share = hiddenShare({ x: b.x0, y: 0, w: b.x1 - b.x0, h: SLIDE_H }, covers);
			worst = Math.max(worst, share - hiddenFreeFor(photoOf(b)));
		}
		return worst;
	};
	const clashes = (fx: number, w: number) =>
		frames.some((f) => fx < f.x + frameWidth(f) + gap && fx + w + gap > f.x);
	/** Height so the frame fits, capping width at `maxW`. */
	const fitHeight = (aspect: number, h: number, maxW: number) => {
		let hh = Math.min(h, SLIDE_H - 2 * preset.frameMargin);
		while (frameWidth({ h: hh, aspect, border: borderFor(hh) }) > maxW && hh > 300) hh *= 0.95;
		return hh;
	};
	/** Move the nearest movable join under [x0, x1] if none is there already. */
	const hideJoinUnder = (x0: number, x1: number) => {
		const inner0 = x0 + (x1 - x0) * 0.2;
		const inner1 = x1 - (x1 - x0) * 0.2;
		if (backgrounds.slice(2).some((b) => b.x0 > inner0 && b.x0 < inner1)) return;
		const centre = (x0 + x1) / 2;
		let best = -1;
		let bestD = Infinity;
		for (let i = 2; i < backgrounds.length; i++) {
			const d = Math.abs(backgrounds[i].x0 - centre);
			const [lo, hi] = joinLimits(i);
			if (d < bestD && centre >= lo && centre <= hi) [best, bestD] = [i, d];
		}
		if (best < 0 || bestD > SLIDE_W * 1.2) return;
		const [lo, hi] = joinLimits(best);
		const at = Math.round(Math.min(hi, Math.max(lo, centre + r.range(-0.15, 0.15) * (x1 - x0))));
		backgrounds[best - 1].x1 = at;
		backgrounds[best].x0 = at;
	};

	// Slides that can hold a frame (never slide 1), preferring ones with a join inside.
	const slideHasJoin = (k: number) =>
		backgrounds.slice(2).some((b) => b.x0 > k * SLIDE_W + 150 && b.x0 < (k + 1) * SLIDE_W - 150);

	for (const fp of r.shuffle(framePhotos)) {
		const aspect = aspectOf(fp);
		const contrastAt = (cx: number) => {
			const under = bgUnder(cx);
			const up = under?.photoId ? input.photoMap.get(under.photoId) : undefined;
			return up && up.analysis.isMono !== fp.analysis.isMono ? 1 : 0;
		};
		let placed: Frame | null = null;

		if (r.next() < 0.8) {
			// Centred on a slide.
			const h = fitHeight(aspect, r.range(0.75, 0.88) * SLIDE_H, SLIDE_W * 0.86);
			const border = borderFor(h);
			const w = frameWidth({ h, aspect, border });
			const slides = Array.from({ length: slideCount - 1 }, (_, i) => i + 1)
				.map((k) => ({
					k,
					rank:
						(slideHasJoin(k) ? 1 : 0) +
						contrastAt((k + 0.5) * SLIDE_W) * 1 +
						(k === slideCount - 1 ? -0.6 : 0) + // keep the last slide mostly clear (R4)
						-buries({ x: (k + 0.5) * SLIDE_W - w / 2, y: (SLIDE_H - h) / 2, w, h }) * 4 +
						-subjectRisk({ x: (k + 0.5) * SLIDE_W - w / 2, y: (SLIDE_H - h) / 2, w, h }) * 2 +
						r.range(0, 0.5)
				}))
				.sort((a, b) => b.rank - a.rank);
			for (const { k } of slides) {
				const fx = (k + 0.5) * SLIDE_W - w / 2;
				if (fx < SLIDE_W + 8 || fx + w > W || clashes(fx, w)) continue;
				placed = {
					id: `f${frames.length}-${seed}`,
					photoId: fp.id,
					x: Math.round(fx),
					y: Math.round((SLIDE_H - h) / 2),
					h: Math.round(h),
					aspect,
					border,
					crop: { ...CENTRED }
				};
				break;
			}
		}

		if (!placed) {
			// Smaller, off-centre, across a slide edge (like the bike detail in carousel 1).
			// Landscape frames can be small (they're wide); portrait ones need more height to read.
			const [lo, hi] = aspect >= 1 ? [0.4, 0.6] : [0.55, 0.72];
			const h = fitHeight(aspect, r.range(lo, hi) * SLIDE_H, SLIDE_W * 1.1);
			const border = borderFor(h);
			const w = frameWidth({ h, aspect, border });
			let bestCost = Infinity;
			for (const e of r.shuffle(Array.from({ length: slideCount - 2 }, (_, i) => i + 2))) {
				const edge = e * SLIDE_W;
				for (const side of [0.3, 0.5, 0.7]) {
					const fx = edge - w * side;
					if (fx < SLIDE_W + 8 || fx + w > W || clashes(fx, w)) continue;
					for (const yFrac of [0.08, 0.5, 0.92]) {
						const fy = preset.frameMargin + (SLIDE_H - 2 * preset.frameMargin - h) * yFrac;
						const cost =
							coveredSaliency({ x: fx, y: fy, w, h }) +
							buries({ x: fx, y: fy, w, h }) * 2 -
							contrastAt(edge) * 0.6 +
							r.range(0, 0.1);
						if (cost < bestCost) {
							bestCost = cost;
							placed = {
								id: `f${frames.length}-${seed}`,
								photoId: fp.id,
								x: Math.round(fx),
								y: Math.round(fy),
								h: Math.round(h),
								aspect,
								border,
								crop: { ...CENTRED }
							};
						}
					}
				}
			}
		}
		if (!placed) return null; // couldn't fit: let another seed try
		frames.push(placed);
		hideJoinUnder(placed.x, placed.x + frameWidth(placed));
	}

	// 4. Nudge visible joins away from slide edges (R6); hidden ones can stay put.
	for (let i = 2; i < backgrounds.length; i++) {
		const at = backgrounds[i].x0;
		const hidden = frames.some((f) => at > f.x + 8 && at < f.x + frameWidth(f) - 8);
		if (hidden) continue;
		const nearest = Math.round(at / SLIDE_W) * SLIDE_W;
		const d = at - nearest;
		if (Math.abs(d) >= preset.joinClearance) continue;
		const target = nearest + (d >= 0 ? 1 : -1) * preset.joinClearance;
		const [lo, hi] = joinLimits(i);
		if (lo > hi) continue;
		const moved = Math.round(Math.min(hi, Math.max(lo, target)));
		backgrounds[i - 1].x1 = moved;
		backgrounds[i].x0 = moved;
	}

	// 5. Line horizons up between neighbouring backgrounds.
	for (let i = 2; i < backgrounds.length; i++) {
		const prev = backgrounds[i - 1];
		const cur = backgrounds[i];
		const pp = prev.photoId ? input.photoMap.get(prev.photoId) : undefined;
		const cp = cur.photoId ? input.photoMap.get(cur.photoId) : undefined;
		if (!pp || !cp) continue;
		const y = horizonBoxY(pp, prev.x1 - prev.x0, prev.crop);
		if (y !== null) cur.crop = alignHorizon(cp, cur.x1 - cur.x0, cur.crop, y);
	}

	const carousel: Carousel = { slideCount, backgrounds, frames };
	return structuralErrors(carousel).length ? null : carousel;
}

/** A rough fingerprint for diversity: which photos are frames, slide count, order. */
function signature(c: Carousel): string[] {
	return [
		`n${c.slideCount}`,
		...c.frames.map((f) => `f:${f.photoId}`),
		...c.backgrounds.map((b, i) => `b${i}:${b.photoId}`)
	];
}

function similarity(a: string[], b: string[]): number {
	const sa = new Set(a);
	const shared = b.filter((x) => sa.has(x)).length;
	return shared / Math.max(a.length, b.length);
}

/**
 * Generate `tries` candidates and pick `count` that are good *and* different
 * (maximal marginal relevance).
 */
export function suggestCarousels(
	input: CarouselInput,
	{ count = 4, tries = 300, seed = 1 }: { count?: number; tries?: number; seed?: number } = {}
): Suggestion[] {
	const candidates: Suggestion[] = [];
	for (let i = 0; i < tries; i++) {
		const s = seed * 100_003 + i;
		const carousel = generateCarousel(input, s);
		if (carousel)
			candidates.push({
				carousel,
				score: scoreCarousel(carousel, input.photoMap, input.preset),
				seed: s
			});
	}
	candidates.sort((a, b) => b.score.total - a.score.total);
	const picked: Suggestion[] = [];
	const sigs: string[][] = [];
	const pool = candidates.slice(0, 60);
	while (picked.length < count && pool.length) {
		let bestI = 0;
		let best = -Infinity;
		pool.forEach((c, i) => {
			const sig = signature(c.carousel);
			const maxSim = sigs.length ? Math.max(...sigs.map((s) => similarity(sig, s))) : 0;
			const v = c.score.total - 2 * maxSim;
			if (v > best) [best, bestI] = [v, i];
		});
		const [chosen] = pool.splice(bestI, 1);
		picked.push(chosen);
		sigs.push(signature(chosen.carousel));
	}
	return picked;
}
