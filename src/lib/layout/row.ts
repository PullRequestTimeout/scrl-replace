/**
 * Grid-row suggestions (PLAN.md §6.2): split panoramas and matched trios, honouring pinned
 * tiles, returning a few good and different options.
 */
import { labDistance } from '#lib/analysis/color.ts';
import { hammingDistance } from '#lib/analysis/features.ts';
import { GRID_HIDDEN_SIDE, GRID_VISIBLE_W, SLIDE_H, SPLIT_SOURCE_W } from '#lib/model/constants.ts';
import { cropSource, type Crop } from '#lib/model/layout.ts';
import type { GridRow } from '#lib/model/row.ts';
import type { PhotoId } from '#lib/model/types.ts';
import { aspectOf, type LayoutPhoto } from './types.ts';

export type RowMode = 'any' | 'split' | 'matched';
export type Pins = [PhotoId | null, PhotoId | null, PhotoId | null];

export interface RowOption {
	row: GridRow;
	score: number;
}

// ---------------------------------------------------------------------------
// Split

/** Saliency mass of a photo inside photo-pixel rectangle `r`, as a share of the whole photo. */
function massIn(p: LayoutPhoto, r: { x: number; y: number; w: number; h: number }): number {
	const m = p.analysis.saliency.map;
	let inside = 0;
	let total = 0;
	for (let gy = 0; gy < m.h; gy++) {
		const py = ((gy + 0.5) / m.h) * p.height;
		for (let gx = 0; gx < m.w; gx++) {
			const px = ((gx + 0.5) / m.w) * p.width;
			const v = m.values[gy * m.w + gx];
			total += v;
			if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) inside += v;
		}
	}
	return total ? inside / total : 0;
}

export function canSplit(p: LayoutPhoto): boolean {
	return aspectOf(p) >= 1.2 && p.width >= SPLIT_SOURCE_W;
}

function scoreSplit(p: LayoutPhoto, crop: Crop): number {
	const P = cropSource(p.width, p.height, SPLIT_SOURCE_W, SLIDE_H, crop);
	const k = P.w / SPLIT_SOURCE_W;
	const coverage = massIn(p, P);
	// Spread across the three visible tiles: something worth seeing in each.
	const shares = [0, 1, 2].map((i) =>
		massIn(p, {
			x: P.x + (GRID_HIDDEN_SIDE + i * GRID_VISIBLE_W) * k,
			y: P.y,
			w: GRID_VISIBLE_W * k,
			h: P.h
		})
	);
	const sum = shares.reduce((a, b) => a + b, 0) || 1;
	const entropy =
		-shares.reduce((e, s) => (s > 0 ? e + (s / sum) * Math.log(s / sum) : e), 0) / Math.log(3);
	// Mild penalty for the subject's densest part landing right on a cut.
	const cut = [1, 2].reduce((acc, i) => {
		const x = P.x + (GRID_HIDDEN_SIDE + i * GRID_VISIBLE_W) * k;
		const band = massIn(p, { x: x - 30 * k, y: P.y, w: 60 * k, h: P.h });
		return acc + Math.max(0, band / ((60 / SPLIT_SOURCE_W) * coverage || 1) - 1.5);
	}, 0);
	const hy = p.analysis.horizonY;
	const horizon =
		hy !== null && hy * p.height > P.y + 0.2 * P.h && hy * p.height < P.y + 0.85 * P.h ? 1 : 0;
	return (
		2 * coverage + 1.2 * entropy - 0.3 * Math.min(2, cut) + 0.4 * horizon - 1.5 * (crop.zoom - 1)
	);
}

function bestSplit(p: LayoutPhoto): RowOption {
	let best: RowOption | null = null;
	for (const zoom of [1, 1.12, 1.25]) {
		for (let fy = 0; fy <= 1.0001; fy += 0.05) {
			for (const fx of zoom === 1 ? [0.5] : [0.35, 0.5, 0.65]) {
				const crop = { fx, fy, zoom };
				const score = scoreSplit(p, crop);
				if (!best || score > best.score)
					best = { row: { mode: 'split', photoId: p.id, crop }, score };
			}
		}
	}
	return best!;
}

// ---------------------------------------------------------------------------
// Matched

/** How badly a photo suffers being cropped to the grid tile's 3:4 window. */
const tileLoss = (p: LayoutPhoto) => {
	const a = aspectOf(p);
	return 1 - Math.min(a, 0.75) / Math.max(a, 0.75);
};

function tonalDistance(a: LayoutPhoto, b: LayoutPhoto): number {
	const A = a.analysis;
	const B = b.analysis;
	let colour = 0;
	for (const da of A.dominant) {
		const nearest = Math.min(...B.dominant.map((db) => labDistance(da.lab, db.lab)));
		colour += da.weight * nearest;
	}
	return (
		(A.isMono !== B.isMono ? 1.5 : 0) +
		colour / 40 +
		Math.abs(A.lumaMean - B.lumaMean) * 2 +
		Math.abs(A.warmth - B.warmth) / 25
	);
}

const SHOT_RANK = { wide: 0, medium: 1, close: 2 } as const;

/** Best left/middle/right order for three photos: widest shot in the middle (like the dog row). */
function orderTrio(t: LayoutPhoto[], pins: Pins): LayoutPhoto[] | null {
	const perms = [
		[0, 1, 2],
		[0, 2, 1],
		[1, 0, 2],
		[1, 2, 0],
		[2, 0, 1],
		[2, 1, 0]
	];
	let best: LayoutPhoto[] | null = null;
	let bestScore = -Infinity;
	for (const perm of perms) {
		const o = perm.map((i) => t[i]);
		if (pins.some((pin, i) => pin && o[i].id !== pin)) continue;
		const middleWidest =
			SHOT_RANK[o[1].analysis.shot] <=
			Math.min(SHOT_RANK[o[0].analysis.shot], SHOT_RANK[o[2].analysis.shot])
				? 1
				: 0;
		const timeOrder =
			o.every((p) => p.capturedAt !== undefined) &&
			o[0].capturedAt! <= o[1].capturedAt! &&
			o[1].capturedAt! <= o[2].capturedAt!
				? 0.3
				: 0;
		const s = middleWidest + timeOrder - perm.reduce((a, v, i) => a + Math.abs(v - i), 0) * 0.01;
		if (s > bestScore) [best, bestScore] = [o, s];
	}
	return best;
}

function scoreMatched(o: LayoutPhoto[]): number {
	const [a, b, c] = o;
	const tone = (tonalDistance(a, b) + tonalDistance(b, c) + tonalDistance(a, c)) / 3;
	const shots = new Set(o.map((p) => p.analysis.shot)).size;
	const loss = (tileLoss(a) + tileLoss(b) + tileLoss(c)) / 3;
	const dup = [
		hammingDistance(a.analysis.dhash, b.analysis.dhash),
		hammingDistance(b.analysis.dhash, c.analysis.dhash),
		hammingDistance(a.analysis.dhash, c.analysis.dhash)
	].some((d) => d < 6)
		? 1
		: 0;
	return 3 - 1.6 * tone + 0.25 * (shots - 1) - 1.5 * loss - 1.5 * dup;
}

const tileCrop = (p: LayoutPhoto): Crop => ({
	fx: p.analysis.saliency.cx,
	fy: p.analysis.saliency.cy,
	zoom: 1
});

// ---------------------------------------------------------------------------

const rowKey = (r: GridRow) => (r.mode === 'split' ? [r.photoId] : [...r.tiles]);

export function suggestRows(
	photos: LayoutPhoto[],
	{ pins = [null, null, null] as Pins, mode = 'any' as RowMode, count = 4 } = {}
): RowOption[] {
	const options: RowOption[] = [];
	const pinned = pins.filter((p): p is PhotoId => p !== null);

	if (mode !== 'matched') {
		const uniquePins = new Set(pinned);
		for (const p of photos.filter(canSplit)) {
			if (uniquePins.size > 1 || (uniquePins.size === 1 && !uniquePins.has(p.id))) continue;
			options.push(bestSplit(p));
		}
	}

	if (mode !== 'split' && photos.length >= 3 && new Set(pinned).size === pinned.length) {
		const byId = new Map(photos.map((p) => [p.id, p]));
		const pinPhotos = pinned.map((id) => byId.get(id)).filter((p): p is LayoutPhoto => !!p);
		const rest = photos.filter((p) => !pinned.includes(p.id));
		const need = 3 - pinPhotos.length;
		const combos: LayoutPhoto[][] = [];
		const choose = (start: number, acc: LayoutPhoto[]) => {
			if (acc.length === need) return void combos.push([...pinPhotos, ...acc]);
			for (let i = start; i < rest.length; i++) choose(i + 1, [...acc, rest[i]]);
		};
		choose(0, []);
		for (const trio of combos) {
			const ordered = orderTrio(trio, pins);
			if (!ordered) continue;
			options.push({
				row: {
					mode: 'matched',
					tiles: ordered.map((p) => p.id) as [PhotoId, PhotoId, PhotoId],
					crops: ordered.map(tileCrop) as [Crop, Crop, Crop]
				},
				score: scoreMatched(ordered)
			});
		}
	}

	// Pick good and different: penalise sharing photos with options already chosen.
	options.sort((a, b) => b.score - a.score);
	const picked: RowOption[] = [];
	const pool = options.slice(0, 300);
	while (picked.length < count && pool.length) {
		let bestI = 0;
		let best = -Infinity;
		pool.forEach((o, i) => {
			const key = rowKey(o.row);
			const overlap = picked.length
				? Math.max(
						...picked.map(
							(p) =>
								rowKey(p.row).filter((id) => key.includes(id) && !pinned.includes(id)).length /
								key.length
						)
					)
				: 0;
			const modeBonus = picked.some((p) => p.row.mode === o.row.mode) ? 0 : 0.3;
			const v = o.score - 1.5 * overlap + modeBonus;
			if (v > best) [best, bestI] = [v, i];
		});
		picked.push(pool.splice(bestI, 1)[0]);
	}
	return picked;
}
