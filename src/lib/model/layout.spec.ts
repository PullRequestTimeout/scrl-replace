import { describe, expect, it } from 'vitest';
import {
	cropSource,
	frameWidth,
	slidesTouched,
	structuralErrors,
	type Carousel
} from './layout.ts';
import { REFERENCE_CAROUSELS } from '#lib/fixtures/reference-carousels.ts';

describe('cropSource', () => {
	it('covers a box with no zoom, centred', () => {
		// 3:2 photo into a 4:5 box: full height, centred horizontally.
		const r = cropSource(3000, 2000, 1080, 1350, { fx: 0.5, fy: 0.5, zoom: 1 });
		expect(r.h).toBeCloseTo(2000);
		expect(r.w).toBeCloseTo(1600);
		expect(r.x).toBeCloseTo(700);
		expect(r.y).toBeCloseTo(0);
	});

	it('clamps the focus point so the crop stays inside the photo', () => {
		const r = cropSource(3000, 2000, 1080, 1350, { fx: 0, fy: 0.5, zoom: 1 });
		expect(r.x).toBe(0);
		const right = cropSource(3000, 2000, 1080, 1350, { fx: 1, fy: 0.5, zoom: 1 });
		expect(right.x + right.w).toBeCloseTo(3000);
	});

	it('zoom shrinks the source rectangle', () => {
		const r = cropSource(3000, 2000, 1080, 1350, { fx: 0.5, fy: 0.5, zoom: 2 });
		expect(r.h).toBeCloseTo(1000);
		expect(r.y).toBeCloseTo(500);
	});
});

describe('frames', () => {
	it('derives width from inner aspect and border', () => {
		expect(frameWidth({ h: 570, aspect: 1.274, border: 22 })).toBeCloseTo(526 * 1.274 + 44);
	});

	it('reports which slides an element touches', () => {
		expect(slidesTouched({ x: 1000, y: 0, w: 200, h: 10 })).toEqual([0, 1]);
		expect(slidesTouched({ x: 1080, y: 0, w: 1080, h: 10 })).toEqual([1]);
	});
});

describe('reference carousels', () => {
	it('are structurally valid once photo ids are filled in', () => {
		for (const ref of REFERENCE_CAROUSELS.carousels) {
			const c: Carousel = {
				slideCount: ref.slideCount,
				backgrounds: ref.backgrounds.map((b) => ({ ...b, photoId: b.photo })),
				frames: ref.frames.map((f, i) => ({ ...f, id: String(i), photoId: f.photo }))
			};
			expect(structuralErrors(c)).toEqual([]);
		}
	});

	it('hide every off-edge background join under a frame or keep it 120px from slide edges', () => {
		for (const ref of REFERENCE_CAROUSELS.carousels) {
			for (const b of ref.backgrounds.slice(1)) {
				const join = b.x0;
				const covered = ref.frames.some((f) => join > f.x && join < f.x + frameWidth(f));
				const distanceToEdge = Math.min(join % 1080, 1080 - (join % 1080));
				expect(covered || distanceToEdge <= 2 || distanceToEdge >= 116).toBe(true);
			}
		}
	});
});
