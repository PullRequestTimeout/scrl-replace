import { describe, expect, it } from 'vitest';
import { analyzePixels } from '#lib/analysis/features.ts';
import { fitWithin } from '#lib/images/geometry.ts';
import { WORKING_LONG_EDGE } from '#lib/model/constants.ts';
import { rowPhotos, rowTiles } from '#lib/model/row.ts';
import { backgroundRect, frameOuter } from '#lib/model/layout.ts';
import { DEFAULT_PRESET } from '#lib/model/presets.ts';
import { suggestCarousels } from './carousel.ts';
import { hiddenShare } from './score.ts';
import { fixturePixels, fixtureSet } from '#lib/testing/fixtures.ts';
import { assignPhotos } from './assign.ts';
import { canSplit, suggestRows } from './row.ts';
import type { LayoutPhoto } from './types.ts';

function load(set: 'og-gallery' | 'example-gallery', withTimes = true): LayoutPhoto[] {
	return fixtureSet(set).map((f, i) => {
		const working = fitWithin({ width: f.origWidth, height: f.origHeight }, WORKING_LONG_EDGE);
		const m = f.exifDate?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
		return {
			id: f.name,
			width: f.origWidth,
			height: f.origHeight,
			workingWidth: working.width,
			workingHeight: working.height,
			analysis: analyzePixels(fixturePixels(set, f)),
			capturedAt:
				withTimes && m
					? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
					: undefined,
			importIndex: i
		};
	});
}

const EXAMPLE = fixtureSet('example-gallery');

describe.skipIf(EXAMPLE.length === 0)('row suggestions on the example gallery', () => {
	const photos = load('example-gallery');

	it('offers a mix of split and matched rows, all different', () => {
		const opts = suggestRows(photos, { count: 4 });
		expect(opts).toHaveLength(4);
		expect(new Set(opts.map((o) => o.row.mode)).size).toBe(2);
		const keys = opts.map((o) => rowPhotos(o.row).join());
		expect(new Set(keys).size).toBe(4);
	});

	it('only splits photos wide and large enough', () => {
		const splits = suggestRows(photos, { mode: 'split', count: 10 });
		expect(splits.length).toBeGreaterThan(0);
		for (const o of splits) {
			const p = photos.find((x) => o.row.mode === 'split' && x.id === o.row.photoId)!;
			expect(canSplit(p)).toBe(true);
		}
		expect(canSplit(photos.find((p) => p.id.endsWith('-104.jpg'))!)).toBe(false);
	});

	it('honours pinned tiles', () => {
		const pin = photos[5].id;
		const opts = suggestRows(photos, { mode: 'matched', pins: [null, pin, null], count: 3 });
		expect(opts.length).toBe(3);
		for (const o of opts) expect(o.row.mode === 'matched' && o.row.tiles[1]).toBe(pin);
	});

	it('keeps matched trios tonally consistent (no colour/B&W mixes at the top)', () => {
		const top = suggestRows(photos, { mode: 'matched', count: 1 })[0].row;
		if (top.mode !== 'matched') throw new Error('expected matched');
		const monos = top.tiles.map((id) => photos.find((p) => p.id === id)!.analysis.isMono);
		expect(new Set(monos).size).toBe(1);
	});

	it('assigns every remaining photo once, in balanced groups, with or without times', () => {
		for (const withTimes of [true, false]) {
			const ps = load('example-gallery', withTimes);
			const row = suggestRows(ps, { count: 1 })[0].row;
			const groups = assignPhotos(row, ps);
			const all = groups.flat();
			const used = new Set(rowPhotos(row));
			expect(new Set(all).size).toBe(all.length);
			expect(all.length).toBe(ps.filter((p) => !used.has(p.id)).length);
			const sizes = groups.map((g) => g.length);
			expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
		}
	});

	it('shares colour and B&W evenly across the carousels', () => {
		for (const { row } of suggestRows(photos, { count: 4 })) {
			const byId = new Map(photos.map((p) => [p.id, p]));
			const mono = assignPhotos(row, photos).map(
				(g) => g.filter((id) => byId.get(id)!.analysis.isMono).length
			);
			expect(Math.max(...mono) - Math.min(...mono)).toBeLessThanOrEqual(1);
		}
	});

	it('mostly sets B&W frames on colour backgrounds and colour frames on B&W, landscapes behind, no background buried', () => {
		const byId = new Map(photos.map((p) => [p.id, p]));
		let frames = 0;
		let contrasting = 0;
		let landscapes = 0;
		let landscapesFramed = 0;
		let worstHidden = 0;
		for (const { row } of suggestRows(photos, { count: 4 })) {
			const groups = assignPhotos(row, photos);
			rowTiles(row, (id) => byId.get(id)!).forEach((tile, i) => {
				const [best] = suggestCarousels(
					{
						tile,
						photos: groups[i].map((id) => byId.get(id)!),
						photoMap: byId,
						preset: DEFAULT_PRESET
					},
					{ count: 1, tries: 250, seed: 7 + i }
				);
				const c = best.carousel;
				const framed = new Set(c.frames.map((f) => f.photoId));
				for (const b of c.backgrounds.slice(1))
					worstHidden = Math.max(
						worstHidden,
						hiddenShare(backgroundRect(b), c.frames.map(frameOuter))
					);
				for (const id of groups[i]) {
					const p = byId.get(id)!;
					if (p.width / p.height < 1.15) continue;
					landscapes++;
					if (framed.has(id)) landscapesFramed++;
				}
				for (const f of c.frames) {
					const o = frameOuter(f);
					const cx = o.x + o.w / 2;
					const under = c.backgrounds.find((b) => cx >= b.x0 && cx < b.x1);
					if (!under?.photoId) continue;
					frames++;
					if (byId.get(f.photoId)!.analysis.isMono !== byId.get(under.photoId)!.analysis.isMono)
						contrasting++;
				}
			});
		}
		expect(contrasting / frames).toBeGreaterThanOrEqual(0.6);
		expect(landscapesFramed / landscapes).toBeLessThanOrEqual(0.1);
		expect(worstHidden).toBeLessThanOrEqual(0.7);
	});
});
