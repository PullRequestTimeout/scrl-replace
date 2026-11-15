import { GRID_VISIBLE_W, SLIDE_H, SLIDE_W, SPLIT_SOURCE_W } from './constants.ts';
import { cropSource, type Background, type Crop } from './layout.ts';
import type { PhotoId } from './types.ts';

/**
 * The profile-grid row: either one wide photo cut across the three tiles, or three photos
 * with a matched look. Tiles are left, middle, right.
 */
export type GridRow =
	| {
			mode: 'split';
			photoId: PhotoId;
			/** Crop of the photo in the full panorama box (SPLIT_SOURCE_W × SLIDE_H). */
			crop: Crop;
	  }
	| {
			mode: 'matched';
			tiles: [PhotoId, PhotoId, PhotoId];
			/** Crop of each photo in its 1080×1350 first slide. */
			crops: [Crop, Crop, Crop];
	  };

export interface PhotoSize {
	width: number;
	height: number;
}

/**
 * Where tile i's 1080px first slide sits inside the panorama (panorama px). The visible grid
 * crops (1012.5 wide) sit edge to edge, and each slide adds the 33.75px the grid hides on each
 * side, so neighbouring slides share ~67px that's never seen in the grid (lined up for the
 * grid view, as agreed).
 */
export const tileSpanInPanorama = (i: number) => ({ x: i * GRID_VISIBLE_W, w: SLIDE_W });

/** Convert a split row into the cover crop each first slide needs. */
export function splitTileCrop(photo: PhotoSize, panoramaCrop: Crop, i: number): Crop {
	const P = cropSource(photo.width, photo.height, SPLIT_SOURCE_W, SLIDE_H, panoramaCrop);
	const span = tileSpanInPanorama(i);
	const sub = {
		x: P.x + (span.x / SPLIT_SOURCE_W) * P.w,
		w: (span.w / SPLIT_SOURCE_W) * P.w,
		y: P.y,
		h: P.h
	};
	const cover = Math.max(SLIDE_W / photo.width, SLIDE_H / photo.height);
	return {
		fx: (sub.x + sub.w / 2) / photo.width,
		fy: (sub.y + sub.h / 2) / photo.height,
		zoom: SLIDE_W / (cover * sub.w)
	};
}

/** The three first-slide backgrounds a row implies. */
export function rowTiles(
	row: GridRow,
	sizeOf: (id: PhotoId) => PhotoSize
): [Background, Background, Background] {
	const tile = (photoId: PhotoId, crop: Crop): Background => ({
		photoId,
		x0: 0,
		x1: SLIDE_W,
		crop
	});
	if (row.mode === 'matched') {
		return [0, 1, 2].map((i) => tile(row.tiles[i], row.crops[i])) as [
			Background,
			Background,
			Background
		];
	}
	const size = sizeOf(row.photoId);
	return [0, 1, 2].map((i) => tile(row.photoId, splitTileCrop(size, row.crop, i))) as [
		Background,
		Background,
		Background
	];
}

/** Photos the row itself uses. */
export function rowPhotos(row: GridRow): PhotoId[] {
	return row.mode === 'split' ? [row.photoId] : [...row.tiles];
}
