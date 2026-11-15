import { describe, expect, it } from 'vitest';
import { GRID_VISIBLE_W, SLIDE_H, SLIDE_W, SPLIT_SOURCE_W } from './constants.ts';
import { cropSource } from './layout.ts';
import { splitTileCrop, tileSpanInPanorama } from './row.ts';

describe('split rows', () => {
	const photo = { width: 6400, height: 3600 };
	const pano = { fx: 0.5, fy: 0.5, zoom: 1 };
	const P = cropSource(photo.width, photo.height, SPLIT_SOURCE_W, SLIDE_H, pano);

	it('cuts the panorama into three slides that line up in the grid view', () => {
		const px = (i: number) => {
			const c = splitTileCrop(photo, pano, i);
			return cropSource(photo.width, photo.height, SLIDE_W, SLIDE_H, c);
		};
		const k = P.w / SPLIT_SOURCE_W; // photo px per panorama px
		for (const i of [0, 1, 2]) {
			const r = px(i);
			const span = tileSpanInPanorama(i);
			expect(r.x).toBeCloseTo(P.x + span.x * k, 3);
			expect(r.w).toBeCloseTo(SLIDE_W * k, 3);
			expect(r.y).toBeCloseTo(P.y, 3);
			expect(r.h).toBeCloseTo(P.h, 3);
		}
		// Visible (grid) parts meet exactly: tile i's visible right edge = tile i+1's visible left edge.
		const hidden = (SLIDE_W - GRID_VISIBLE_W) / 2;
		for (const i of [0, 1]) {
			const visRight = px(i).x + (hidden + GRID_VISIBLE_W) * k;
			const visLeft = px(i + 1).x + hidden * k;
			expect(visRight).toBeCloseTo(visLeft, 3);
		}
		// And the three slides together cover exactly the panorama.
		expect(px(2).x + px(2).w).toBeCloseTo(P.x + P.w, 3);
	});
});
