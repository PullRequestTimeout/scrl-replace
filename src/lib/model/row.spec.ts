import { describe, expect, it } from 'vitest';
import { GRID_VISIBLE_W, SLIDE_H, SLIDE_W, SPLIT_SOURCE_W } from './constants.ts';
import { cropSource } from './layout.ts';
import { panoramaCropFromTile, snapTileCrop, splitTileCrop, tileSpanInPanorama } from './row.ts';

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

	it('recovers the panorama from any one tile', () => {
		const crops = [pano, { fx: 0.4, fy: 0.55, zoom: 1.3 }, { fx: 0.62, fy: 0.3, zoom: 2 }];
		for (const c of crops)
			for (const i of [0, 1, 2]) {
				const back = panoramaCropFromTile(photo, splitTileCrop(photo, c, i), i);
				const a = cropSource(photo.width, photo.height, SPLIT_SOURCE_W, SLIDE_H, c);
				const b = cropSource(photo.width, photo.height, SPLIT_SOURCE_W, SLIDE_H, back);
				expect(b.x).toBeCloseTo(a.x, 3);
				expect(b.y).toBeCloseTo(a.y, 3);
				expect(b.w).toBeCloseTo(a.w, 3);
			}
	});

	it('snaps a tile panned past the panorama back to one that fits', () => {
		// Tile 0 pushed to the photo's right edge: tiles 1 and 2 would run off the photo.
		const snapped = snapTileCrop(photo, { fx: 1, fy: 0.5, zoom: 1.2 }, 0);
		const back = panoramaCropFromTile(photo, snapped, 0);
		const P2 = cropSource(photo.width, photo.height, SPLIT_SOURCE_W, SLIDE_H, back);
		expect(P2.x + P2.w).toBeLessThanOrEqual(photo.width + 0.01);
		const t = cropSource(photo.width, photo.height, SLIDE_W, SLIDE_H, snapped);
		expect(t.x).toBeCloseTo(P2.x, 3);
		// A tile that already fits is left alone.
		const fits = splitTileCrop(photo, { fx: 0.45, fy: 0.5, zoom: 1.4 }, 1);
		const again = snapTileCrop(photo, fits, 1);
		expect(again.fx).toBeCloseTo(fits.fx, 6);
		expect(again.fy).toBeCloseTo(fits.fy, 6);
		expect(again.zoom).toBeCloseTo(fits.zoom, 6);
	});
});
