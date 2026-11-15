import { describe, expect, it } from 'vitest';
import { analyzePixels } from '#lib/analysis/features.ts';
import { buildReferenceCarousels } from '#lib/fixtures/reference.ts';
import { REFERENCE_CAROUSELS } from '#lib/fixtures/reference-carousels.ts';
import { fitWithin } from '#lib/images/geometry.ts';
import { SLIDE_H, SLIDE_W, WORKING_LONG_EDGE } from '#lib/model/constants.ts';
import { CENTRED, frameWidth, type Carousel, type Frame } from '#lib/model/layout.ts';
import { DEFAULT_PRESET } from '#lib/model/presets.ts';
import { fixturePixels, fixtureSet } from '#lib/testing/fixtures.ts';
import { checkCarousel } from './warnings.ts';
import type { LayoutPhoto } from './types.ts';

function frame(id: string, cx: number, h = 0.8 * SLIDE_H, y?: number): Frame {
	const border = Math.round(h * 0.03);
	const w = frameWidth({ h, aspect: 0.8, border });
	return {
		id,
		photoId: `p-${id}`,
		x: cx - w / 2,
		y: y ?? (SLIDE_H - h) / 2,
		h,
		aspect: 0.8,
		border,
		crop: { ...CENTRED }
	};
}

function carousel(frames: Frame[], slideCount = 4, photo: string | null = 'bg'): Carousel {
	return {
		slideCount,
		backgrounds: [
			{ photoId: 'tile', x0: 0, x1: SLIDE_W, crop: { ...CENTRED } },
			{ photoId: photo, x0: SLIDE_W, x1: slideCount * SLIDE_W, crop: { ...CENTRED } }
		],
		frames
	};
}

const rules = (c: Carousel) =>
	checkCarousel(c, new Map(), DEFAULT_PRESET)
		.filter((w) => w.level === 'hard')
		.map((w) => w.rule);

describe('checkCarousel: hard rules', () => {
	it('passes a clean layout', () => {
		expect(rules(carousel([frame('a', 1.5 * SLIDE_W)]))).toEqual([]);
	});

	it('allows short panoramas but not more slides than Instagram takes', () => {
		expect(rules(carousel([], 1))).toEqual([]);
		expect(rules(carousel([], 2))).toEqual([]);
		expect(rules(carousel([], 20))).toEqual([]);
		expect(rules(carousel([], 21))).toEqual(['R1']);
	});

	it('asks you to confirm an empty background rather than calling it an error', () => {
		const w = checkCarousel(carousel([], 4, null), new Map(), DEFAULT_PRESET);
		expect(w.find((x) => x.rule === 'R2')).toMatchObject({
			level: 'soft',
			target: { kind: 'bg', index: 1 }
		});
	});

	it('says whether a background spans more or less than the style allows', () => {
		const wide: LayoutPhoto = {
			id: 'bg',
			width: 3000,
			height: 2000,
			workingWidth: 3000,
			workingHeight: 2000,
			analysis: analyzePixels({
				data: new Uint8ClampedArray(48 * 32 * 4).fill(128),
				width: 48,
				height: 32
			}),
			importIndex: 0
		};
		const span = (slides: number) =>
			checkCarousel(carousel([], slides), new Map([['bg', wide]]), DEFAULT_PRESET).find(
				(x) => x.rule === 'R5'
			)?.message;
		expect(span(5)).toContain('above your usual 1.3–2.2 for landscape photos');
		expect(span(2)).toContain('below your usual 1.3–2.2 for landscape photos');
	});

	it('flags a frame on the grid tile', () => {
		expect(rules(carousel([frame('a', SLIDE_W)]))).toContain('R3');
	});

	it('flags a frame inside the top margin', () => {
		const w = checkCarousel(
			carousel([frame('a', 1.5 * SLIDE_W, 600, 10)]),
			new Map(),
			DEFAULT_PRESET
		);
		expect(w.find((x) => x.rule === 'R10')).toMatchObject({
			target: { kind: 'frame', id: 'a' },
			message: expect.stringContaining('top')
		});
	});

	it('flags overlapping and crowded frames', () => {
		expect(rules(carousel([frame('a', 1.5 * SLIDE_W), frame('b', 1.7 * SLIDE_W)]))).toContain(
			'R14'
		);
		const near = carousel([frame('a', 1.5 * SLIDE_W, 500), frame('b', 2.05 * SLIDE_W, 500)]);
		expect(checkCarousel(near, new Map(), DEFAULT_PRESET).map((w) => w.key)).toContain('gap-a-b');
	});
});

const OG = fixtureSet('og-gallery');

describe.skipIf(OG.length === 0)('checkCarousel on the reference carousels', () => {
	const photos = new Map<string, LayoutPhoto>();
	OG.forEach((f, i) => {
		const working = fitWithin({ width: f.origWidth, height: f.origHeight }, WORKING_LONG_EDGE);
		photos.set(f.name, {
			id: f.name,
			width: f.origWidth,
			height: f.origHeight,
			workingWidth: working.width,
			workingHeight: working.height,
			analysis: analyzePixels(fixturePixels('og-gallery', f)),
			importIndex: i
		});
	});
	const refs = buildReferenceCarousels(
		new Map(REFERENCE_CAROUSELS.photos.map((p) => [p.name, p.name]))
	)!;

	it('finds no hard problems and at most a couple of soft ones in your own posts', () => {
		for (const ref of refs) {
			const warnings = checkCarousel(ref, photos, DEFAULT_PRESET);
			expect(warnings.filter((w) => w.level === 'hard')).toEqual([]);
			expect(warnings.length, warnings.map((w) => w.message).join('\n')).toBeLessThanOrEqual(2);
		}
	});
});
