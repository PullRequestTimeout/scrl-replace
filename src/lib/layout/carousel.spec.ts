import { describe, expect, it } from 'vitest';
import { analyzePixels } from '#lib/analysis/features.ts';
import { fitWithin } from '#lib/images/geometry.ts';
import { SLIDE_W, WORKING_LONG_EDGE } from '#lib/model/constants.ts';
import { CENTRED, maxBackgroundWidth, structuralErrors } from '#lib/model/layout.ts';
import { DEFAULT_PRESET } from '#lib/model/presets.ts';
import { fixturePixels, fixtureSet } from '#lib/testing/fixtures.ts';
import { distributeWidths, generateCarousel } from './carousel.ts';
import type { LayoutPhoto } from './types.ts';

describe('distributeWidths', () => {
	it('fills the target without growing capped widths', () => {
		const w = distributeWidths([800, 1500, 900], [864, Infinity, 900], 3240)!;
		expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(3240, -1);
		expect(w[0]).toBeLessThanOrEqual(864);
		expect(w[2]).toBeLessThanOrEqual(900);
	});

	it('gives up when only capped widths could grow', () => {
		expect(distributeWidths([800, 800], [864, 864], 3240)).toBeNull();
	});

	it('shrinks everything when over target', () => {
		const w = distributeWidths([1500, 1500], [Infinity, Infinity], 2160)!;
		expect(w).toEqual([1080, 1080]);
	});
});

const SETS = (['og-gallery', 'example-gallery'] as const).filter((s) => fixtureSet(s).length);

describe.skipIf(SETS.length === 0)('generated carousels', () => {
	const photos: LayoutPhoto[] = SETS.flatMap((set) =>
		fixtureSet(set).map((f, i) => {
			const working = fitWithin({ width: f.origWidth, height: f.origHeight }, WORKING_LONG_EDGE);
			return {
				id: `${set}/${f.name}`,
				width: f.origWidth,
				height: f.origHeight,
				workingWidth: working.width,
				workingHeight: working.height,
				analysis: analyzePixels(fixturePixels(set, f)),
				importIndex: i
			};
		})
	);
	const map = new Map(photos.map((p) => [p.id, p]));

	it('never widens a portrait background past its natural width at full height', () => {
		let checked = 0;
		for (let start = 0; start + 8 <= photos.length; start += 4) {
			const [tilePhoto, ...rest] = photos.slice(start, start + 8);
			const tile = { photoId: tilePhoto.id, x0: 0, x1: SLIDE_W, crop: { ...CENTRED } };
			for (let seed = 1; seed <= 40; seed++) {
				const c = generateCarousel(
					{ tile, photos: rest, photoMap: map, preset: DEFAULT_PRESET },
					seed
				);
				if (!c) continue;
				expect(structuralErrors(c)).toEqual([]);
				for (const b of c.backgrounds.slice(1)) {
					const p = map.get(b.photoId!)!;
					const cap = maxBackgroundWidth(p.width, p.height);
					expect(b.x1 - b.x0).toBeLessThanOrEqual(cap + 3);
					checked++;
				}
			}
		}
		expect(checked).toBeGreaterThan(200);
	});
});
