/**
 * Split the shoot's remaining photos across the three carousels (PLAN.md §6.3): each photo
 * joins the carousel it best matches in tone (and, when every photo has one, capture time),
 * with sizes kept within one of each other and near-duplicates kept apart. Colour and B&W are
 * shared out evenly, so every carousel can set B&W frames on colour backgrounds and vice versa.
 */
import { hammingDistance, NEAR_DUPLICATE_BITS } from '#lib/analysis/features.ts';
import { rowPhotos, type GridRow } from '#lib/model/row.ts';
import type { PhotoId } from '#lib/model/types.ts';
import type { LayoutPhoto } from './types.ts';
import { STRONG_SUBJECT } from './score.ts';

export type Assignment = [PhotoId[], PhotoId[], PhotoId[]];

function features(p: LayoutPhoto, timeScale: ((t: number) => number) | null): number[] {
	const a = p.analysis;
	const d = a.dominant[0]?.lab ?? { l: 50, a: 0, b: 0 };
	const f = [a.lumaMean * 2, a.chroma / 30, a.warmth / 20, d.l / 50, d.a / 40, d.b / 40];
	if (timeScale && p.capturedAt !== undefined) f.push(timeScale(p.capturedAt) * 1.5);
	return f;
}

const dist = (a: number[], b: number[]) =>
	Math.sqrt(a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0));

const centroid = (vs: number[][]) =>
	vs[0].map((_, i) => vs.reduce((s, v) => s + v[i], 0) / vs.length);

const isStrong = (p: LayoutPhoto) => (p.prominence ?? 0) >= STRONG_SUBJECT;

export function assignPhotos(row: GridRow, photos: LayoutPhoto[]): Assignment {
	const used = new Set(rowPhotos(row));
	const rest = photos.filter((p) => !used.has(p.id));
	const byId = new Map(photos.map((p) => [p.id, p]));

	// Capture time is an optional bonus: only used when every photo has it.
	const times = photos.map((p) => p.capturedAt);
	const timed = times.every((t) => t !== undefined);
	const t0 = timed ? Math.min(...(times as number[])) : 0;
	const span = timed ? Math.max(1, Math.max(...(times as number[])) - t0) : 1;
	const timeScale = timed ? (t: number) => (t - t0) / span : null;
	const f = new Map(photos.map((p) => [p.id, features(p, timeScale)]));

	// Seeds: the tile photos, or for a split row three photos far apart from each other.
	const groups: LayoutPhoto[][] = [[], [], []];
	let seeds: number[][];
	if (row.mode === 'matched') {
		seeds = row.tiles.map((id) => f.get(id)!);
	} else {
		const pool = [...rest].sort((a, b) => a.importIndex - b.importIndex);
		const chosen: LayoutPhoto[] = pool.length ? [pool[0]] : [];
		while (chosen.length < Math.min(3, pool.length)) {
			let best = pool[0];
			let bestD = -1;
			for (const p of pool) {
				if (chosen.includes(p)) continue;
				const d = Math.min(...chosen.map((c) => dist(f.get(p.id)!, f.get(c.id)!)));
				if (d > bestD) [best, bestD] = [p, d];
			}
			chosen.push(best);
		}
		const split = byId.get(row.photoId);
		seeds = [0, 1, 2].map((i) => (chosen[i] ? f.get(chosen[i].id)! : f.get(split!.id)!));
	}

	const capacity = [0, 1, 2].map(
		(i) => Math.floor(rest.length / 3) + (i < rest.length % 3 ? 1 : 0)
	);
	// Even colour/B&W mix: each carousel gets its share of B&W photos. Extra ones go to the
	// carousels that are already one larger, so the quotas always fit the capacities.
	const monoTotal = rest.filter((p) => p.analysis.isMono).length;
	const monoCap = [0, 1, 2].map((i) => Math.floor(monoTotal / 3) + (i < monoTotal % 3 ? 1 : 0));
	const colourCap = capacity.map((c, i) => c - monoCap[i]);
	const fits = (g: number, p: LayoutPhoto) => {
		const mono = groups[g].filter((m) => m.analysis.isMono).length;
		return p.analysis.isMono ? mono < monoCap[g] : groups[g].length - mono < colourCap[g];
	};
	const remaining = new Set(rest);
	while (remaining.size) {
		let bestP: LayoutPhoto | null = null;
		let bestG = 0;
		let bestV = -Infinity;
		for (const p of remaining) {
			for (let g = 0; g < 3; g++) {
				if (groups[g].length >= capacity[g] || !fits(g, p)) continue;
				const members = groups[g].map((m) => f.get(m.id)!);
				const c = centroid([seeds[g], ...members]);
				const dup = groups[g].some(
					(m) => hammingDistance(m.analysis.dhash, p.analysis.dhash) <= NEAR_DUPLICATE_BITS
				);
				// Share strong subjects out too, so no carousel ends up with all the key shots.
				const strongHere = isStrong(p) ? groups[g].filter(isStrong).length : 0;
				const v = -dist(f.get(p.id)!, c) - (dup ? 2 : 0) - 0.5 * strongHere;
				if (v > bestV) [bestV, bestP, bestG] = [v, p, g];
			}
		}
		if (!bestP) break;
		groups[bestG].push(bestP);
		remaining.delete(bestP);
	}
	return groups.map((g) => g.map((p) => p.id)) as Assignment;
}
