import { describe, expect, it } from 'vitest';
import { cropSource } from '#lib/model/layout.ts';
import { effectiveCrop, panCrop, zoomCrop } from './crop-gesture.ts';

// A 3:2 photo in a 4:5 box: only horizontal panning is possible at zoom 1.
const P = { w: 3000, h: 2000 };
const B = { w: 1080, h: 1350 };

describe('crop gestures', () => {
	it('dragging right reveals more of the left side', () => {
		const c = panCrop(P.w, P.h, B.w, B.h, { fx: 0.5, fy: 0.5, zoom: 1 }, 100, 0);
		expect(c.fx).toBeLessThan(0.5);
		expect(c.fy).toBe(0.5);
	});

	it('moves the photo exactly with the finger', () => {
		const start = { fx: 0.5, fy: 0.5, zoom: 1 };
		const before = cropSource(P.w, P.h, B.w, B.h, start);
		const after = cropSource(P.w, P.h, B.w, B.h, panCrop(P.w, P.h, B.w, B.h, start, 100, 0));
		// 100 box px = 100 * (src.w / box.w) photo px.
		expect(before.x - after.x).toBeCloseTo(100 * (before.w / B.w));
	});

	it('clamps at the photo edge', () => {
		const c = panCrop(P.w, P.h, B.w, B.h, { fx: 0.5, fy: 0.5, zoom: 1 }, 99999, 0);
		expect(cropSource(P.w, P.h, B.w, B.h, c).x).toBeCloseTo(0);
	});

	it('starts from the effective centre when the stored focus is out of range', () => {
		const eff = effectiveCrop(P.w, P.h, B.w, B.h, { fx: 0, fy: 0, zoom: 1 });
		expect(eff.fy).toBeCloseTo(0.5);
		const moved = panCrop(P.w, P.h, B.w, B.h, { fx: 0, fy: 0, zoom: 1 }, -10, 0);
		expect(moved.fx).toBeGreaterThan(eff.fx);
	});

	it('zooms within limits', () => {
		expect(zoomCrop(P.w, P.h, B.w, B.h, { fx: 0.5, fy: 0.5, zoom: 1 }, 0.5).zoom).toBe(1);
		expect(zoomCrop(P.w, P.h, B.w, B.h, { fx: 0.5, fy: 0.5, zoom: 1 }, 99).zoom).toBe(5);
	});
});
