import { describe, expect, it } from 'vitest';
import { fixturePixels, fixtureSet, synthetic } from '#lib/testing/fixtures.ts';
import { analyzePixels, hammingDistance, NEAR_DUPLICATE_BITS } from './features.ts';

describe('analysis on synthetic images', () => {
	it('detects black and white, including a slight tint', () => {
		const grey = synthetic(64, 80, (x) => [x * 3, x * 3, x * 3]);
		const sepia = synthetic(64, 80, (x) => [x * 3 + 6, x * 3 + 3, x * 3]);
		const colour = synthetic(64, 80, (x) => [200, 40 + x, 30]);
		expect(analyzePixels(grey).isMono).toBe(true);
		expect(analyzePixels(sepia).isMono).toBe(true);
		expect(analyzePixels(colour).isMono).toBe(false);
	});

	it('finds an off-centre subject', () => {
		// Dark green field with a bright orange square at the right.
		const img = synthetic(160, 100, (x, y) =>
			x > 110 && x < 140 && y > 35 && y < 65 ? [255, 120, 0] : [20, 60, 25]
		);
		const a = analyzePixels(img);
		expect(a.saliency.cx).toBeGreaterThan(0.6);
		expect(a.saliency.cy).toBeGreaterThan(0.35);
		expect(a.saliency.cy).toBeLessThan(0.65);
	});

	it('finds a horizon between sky and ground', () => {
		const img = synthetic(160, 100, (_, y) => (y < 40 ? [190, 210, 235] : [60, 50, 40]));
		const y = analyzePixels(img).horizonY;
		expect(y).not.toBeNull();
		expect(y!).toBeGreaterThan(0.33);
		expect(y!).toBeLessThan(0.47);
	});

	it('reports no horizon on a flat image', () => {
		expect(analyzePixels(synthetic(80, 80, () => [120, 120, 120])).horizonY).toBeNull();
	});

	it('hashes near-duplicates close together and different images apart', () => {
		const a = synthetic(100, 80, (x, y) => [(x * 2) % 255, y * 3, 100]);
		const b = synthetic(100, 80, (x, y) => [Math.min(255, ((x * 2) % 255) + 4), y * 3, 100]);
		// Brightness falls left to right instead of rising.
		const c = synthetic(100, 80, (x) => [255 - x * 2, 255 - x * 2, 200 - x]);
		const ha = analyzePixels(a).dhash;
		expect(hammingDistance(ha, analyzePixels(b).dhash)).toBeLessThanOrEqual(NEAR_DUPLICATE_BITS);
		expect(hammingDistance(ha, analyzePixels(c).dhash)).toBeGreaterThan(NEAR_DUPLICATE_BITS);
	});
});

// The SCRL originals: these are the ones posted in black and white.
const OG = fixtureSet('og-gallery');
const KNOWN_MONO = new Set([
	'DSC05327.jpg',
	'DSC05330.jpg',
	'DSC05394.jpg',
	'DSC05441.jpg',
	'DSC05563-Enhanced-NR.jpg',
	'DSC05621.jpg'
]);

describe.skipIf(OG.length === 0)('analysis on the reference originals', () => {
	const results = OG.map((p) => ({ p, a: analyzePixels(fixturePixels('og-gallery', p)) }));

	it('classifies black and white vs colour correctly', () => {
		const wrong = results
			.filter(({ p, a }) => a.isMono !== KNOWN_MONO.has(p.name))
			.map(
				({ p, a }) => `${p.name}: ${a.isMono ? 'mono' : 'colour'} (chroma ${a.chroma.toFixed(1)})`
			);
		expect(wrong).toEqual([]);
	});

	it('rarely calls two different shots near-duplicates', () => {
		const pairs: number[] = [];
		for (let i = 0; i < results.length; i++)
			for (let j = i + 1; j < results.length; j++)
				pairs.push(hammingDistance(results[i].a.dhash, results[j].a.dhash));
		const nearDupes = pairs.filter((d) => d <= NEAR_DUPLICATE_BITS).length;
		expect(nearDupes).toBeLessThan(pairs.length * 0.05);
	});

	it('puts the subject of the bridge shot in the middle and gives every photo a box', () => {
		for (const { a } of results) {
			expect(a.saliency.box.w).toBeGreaterThan(0);
			expect(a.saliency.map.values).toHaveLength(a.saliency.map.w * a.saliency.map.h);
		}
		const bridge = results.find((r) => r.p.name === 'DSC05487.jpg')!.a;
		expect(bridge.saliency.cx).toBeGreaterThan(0.3);
		expect(bridge.saliency.cx).toBeLessThan(0.7);
	});
});
