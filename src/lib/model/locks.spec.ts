import { describe, expect, it } from 'vitest';
import { SLIDE_W } from './constants.ts';
import type { Carousel } from './layout.ts';
import {
	anyLocked,
	guardSplitTile,
	isLocked,
	lockedCarouselUsing,
	syncSplitRow,
	withLock
} from './locks.ts';
import { rowTiles, splitTileCrop, type GridRow } from './row.ts';
import type { Project } from './types.ts';

const photo = { width: 6400, height: 3600 };
const sizes: Record<string, { width: number; height: number }> = {
	pano: photo,
	other: { width: 5000, height: 3000 },
	a: { width: 3000, height: 4000 },
	b: { width: 3000, height: 4000 }
};
const sizeOf = (id: string) => sizes[id];
const row: GridRow = { mode: 'split', photoId: 'pano', crop: { fx: 0.5, fy: 0.5, zoom: 1.2 } };

function carousels(): [Carousel, Carousel, Carousel] {
	const tiles = rowTiles(row, sizeOf);
	return tiles.map((tile, i) => ({
		slideCount: 2,
		backgrounds: [
			{ ...tile },
			{ photoId: i === 0 ? 'a' : 'b', x0: SLIDE_W, x1: 2 * SLIDE_W, crop: tile.crop }
		],
		frames: []
	})) as unknown as [Carousel, Carousel, Carousel];
}

function project(locked?: [boolean, boolean, boolean]): Project {
	return {
		id: 'p',
		name: 'p',
		createdAt: 0,
		updatedAt: 0,
		photoIds: ['pano', 'other', 'a', 'b'],
		presetId: 'x',
		row,
		pinnedTiles: [null, null, null],
		carousels: carousels(),
		locked,
		exportState: { posted: [false, false, false] }
	};
}

const withTile = (c: Carousel, patch: Partial<Carousel['backgrounds'][number]>): Carousel => ({
	...c,
	backgrounds: [{ ...c.backgrounds[0], ...patch }, ...c.backgrounds.slice(1)]
});

describe('locks', () => {
	it('treats a missing lock list as nothing locked', () => {
		const p = project();
		expect(anyLocked(p)).toBe(false);
		expect(isLocked(p, 1)).toBe(false);
		expect(withLock(p, 1, true)).toEqual([false, true, false]);
	});

	it('finds the locked carousel that uses a photo', () => {
		expect(lockedCarouselUsing(project([true, false, false]), 'a')).toBe(0);
		expect(lockedCarouselUsing(project([false, true, false]), 'a')).toBe(-1);
		expect(lockedCarouselUsing(project([false, true, false]), 'b')).toBe(1);
	});
});

describe('split-row first slides', () => {
	it('lets edits that leave slide 1 alone through untouched', () => {
		const p = project([true, false, false]);
		const prev = p.carousels![1];
		const next = { ...prev, slideCount: 3 };
		expect(guardSplitTile(p, 1, prev, next, sizeOf)).toBe(next);
	});

	it('refuses any slide 1 change while another carousel is locked', () => {
		const p = project([true, false, false]);
		const prev = p.carousels![1];
		const next = withTile(prev, { crop: { fx: 0.6, fy: 0.5, zoom: 1.5 } });
		expect(guardSplitTile(p, 1, prev, next, sizeOf)).toMatch(/Carousel 1 is locked/);
	});

	it('keeps slide 1’s edges and border fixed', () => {
		const p = project();
		const prev = p.carousels![2];
		expect(typeof guardSplitTile(p, 2, prev, withTile(prev, { border: 20 }), sizeOf)).toBe(
			'string'
		);
		expect(typeof guardSplitTile(p, 2, prev, withTile(prev, { x1: 900 }), sizeOf)).toBe('string');
	});

	it('snaps a crop or new photo to one that fits a whole panorama', () => {
		const p = project();
		const prev = p.carousels![0];
		const wild = { fx: 1, fy: 0.5, zoom: 1.1 };
		const out = guardSplitTile(p, 0, prev, withTile(prev, { crop: wild }), sizeOf);
		expect(typeof out).toBe('object');
		const crop = (out as Carousel).backgrounds[0].crop;
		expect(crop.fx).toBeLessThan(1);

		const swapped = guardSplitTile(p, 0, prev, withTile(prev, { photoId: 'other' }), sizeOf);
		expect((swapped as Carousel).backgrounds[0].photoId).toBe('other');
	});

	it('recuts all three first slides from the edited one', () => {
		const cs = carousels();
		const crop = { fx: 0.45, fy: 0.4, zoom: 1.6 };
		cs[1] = withTile(cs[1], { crop: splitTileCrop(photo, crop, 1) });
		const synced = syncSplitRow(cs, 1, sizeOf)!;
		expect(synced.row.mode).toBe('split');
		for (const i of [0, 1, 2]) {
			const want = splitTileCrop(photo, crop, i);
			const got = synced.carousels[i].backgrounds[0].crop;
			expect(got.fx).toBeCloseTo(want.fx, 6);
			expect(got.fy).toBeCloseTo(want.fy, 6);
			expect(got.zoom).toBeCloseTo(want.zoom, 6);
			// The rest of each carousel is untouched.
			expect(synced.carousels[i].backgrounds[1]).toEqual(cs[i].backgrounds[1]);
		}
	});

	it('moves all three first slides to a new panorama photo', () => {
		const cs = carousels();
		cs[2] = withTile(cs[2], { photoId: 'other', crop: splitTileCrop(sizes.other, row.crop, 2) });
		const synced = syncSplitRow(cs, 2, sizeOf)!;
		expect(synced.row).toMatchObject({ mode: 'split', photoId: 'other' });
		expect(synced.carousels.map((c) => c.backgrounds[0].photoId)).toEqual([
			'other',
			'other',
			'other'
		]);
	});
});
