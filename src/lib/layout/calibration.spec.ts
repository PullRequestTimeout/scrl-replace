/**
 * Calibration against your real posts: the three SCRL reference carousels should score near
 * the top of randomly arranged layouts of the same photos, and the generator's suggestions
 * should score at least about as well as the originals.
 */
import { describe, expect, it } from 'vitest';
import { analyzePixels } from '#lib/analysis/features.ts';
import { buildReferenceCarousels } from '#lib/fixtures/reference.ts';
import { REFERENCE_CAROUSELS } from '#lib/fixtures/reference-carousels.ts';
import { fitWithin } from '#lib/images/geometry.ts';
import { SLIDE_H, SLIDE_W, WORKING_LONG_EDGE } from '#lib/model/constants.ts';
import { CENTRED, frameWidth, type Carousel } from '#lib/model/layout.ts';
import { DEFAULT_PRESET } from '#lib/model/presets.ts';
import { fixturePixels, fixtureSet } from '#lib/testing/fixtures.ts';
import { suggestCarousels } from './carousel.ts';
import { rng } from './rng.ts';
import { scoreCarousel } from './score.ts';
import type { LayoutPhoto } from './types.ts';

const OG = fixtureSet('og-gallery');

function layoutPhotos(): Map<string, LayoutPhoto> {
	const map = new Map<string, LayoutPhoto>();
	OG.forEach((f, i) => {
		const working = fitWithin({ width: f.origWidth, height: f.origHeight }, WORKING_LONG_EDGE);
		map.set(f.name, {
			id: f.name,
			width: f.origWidth,
			height: f.origHeight,
			workingWidth: working.width,
			workingHeight: working.height,
			analysis: analyzePixels(fixturePixels('og-gallery', f)),
			importIndex: i
		});
	});
	return map;
}

/** Same photos and slide count, arranged at random (but structurally valid). */
function randomLayout(ref: Carousel, seed: number): Carousel {
	const r = rng(seed);
	const W = ref.slideCount * SLIDE_W;
	const [tile, ...rest] = ref.backgrounds;
	const bgPhotos = r.shuffle(rest.map((b) => b.photoId));
	const cuts = bgPhotos
		.slice(1)
		.map(() => r.range(SLIDE_W + 300, W - 300))
		.sort((a, b) => a - b);
	const xs = [SLIDE_W, ...cuts, W];
	const backgrounds = [
		tile,
		...bgPhotos.map((id, i) => ({
			photoId: id,
			x0: Math.round(xs[i]),
			x1: Math.round(xs[i + 1]),
			crop: { ...CENTRED }
		}))
	];
	const frames = ref.frames.map((f, i) => {
		const h = r.range(0.35, 0.95) * SLIDE_H;
		const border = Math.round(h * 0.03);
		const w = frameWidth({ h, aspect: f.aspect, border });
		return {
			...f,
			id: `r${i}`,
			h,
			border,
			x: r.range(SLIDE_W, Math.max(SLIDE_W, W - w)),
			y: r.range(0, SLIDE_H - h)
		};
	});
	return { slideCount: ref.slideCount, backgrounds, frames };
}

describe.skipIf(OG.length === 0)('calibration against the reference carousels', () => {
	const photos = layoutPhotos();
	const refs = buildReferenceCarousels(
		new Map(REFERENCE_CAROUSELS.photos.map((p) => [p.name, p.name]))
	)!;

	it('scores each reference carousel in the top 5% of random arrangements', () => {
		const report = refs.map((ref, i) => {
			const refScore = scoreCarousel(ref, photos, DEFAULT_PRESET).total;
			const randomScores = Array.from(
				{ length: 300 },
				(_, s) => scoreCarousel(randomLayout(ref, i * 1000 + s), photos, DEFAULT_PRESET).total
			);
			const percentile = randomScores.filter((s) => s < refScore).length / randomScores.length;
			return {
				carousel: i + 1,
				refScore: +refScore.toFixed(2),
				percentile: +percentile.toFixed(2)
			};
		});
		console.log('reference vs random', report);
		for (const r of report) expect(r.percentile).toBeGreaterThanOrEqual(0.95);
	});

	it('generates suggestions that score about as well as the originals', () => {
		const report = refs.map((ref, i) => {
			const refScore = scoreCarousel(ref, photos, DEFAULT_PRESET).total;
			const others = ref.backgrounds
				.slice(1)
				.map((b) => b.photoId!)
				.concat(ref.frames.map((f) => f.photoId))
				.map((id) => photos.get(id)!);
			const suggestions = suggestCarousels(
				{ tile: ref.backgrounds[0], photos: others, photoMap: photos, preset: DEFAULT_PRESET },
				{ count: 4, tries: 200 }
			);
			return {
				carousel: i + 1,
				refScore: +refScore.toFixed(2),
				best: +(suggestions[0]?.score.total ?? -99).toFixed(2),
				slides: suggestions.map((s) => s.carousel.slideCount)
			};
		});
		console.log('suggestions vs reference', report);
		for (const r of report) {
			expect(r.slides.length).toBe(4);
			expect(r.best).toBeGreaterThanOrEqual(r.refScore - 0.5);
		}
	});
});
