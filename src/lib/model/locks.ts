import { photosIn, type Background, type Carousel } from './layout.ts';
import {
	panoramaCropFromTile,
	rowTiles,
	snapTileCrop,
	type GridRow,
	type PhotoSize
} from './row.ts';
import type { PhotoId, Project } from './types.ts';

/**
 * Carousel locks: a locked carousel is finished, so it can't be edited and no photos move into
 * or out of it. With a split row, all three first slides are cut from one panorama, so a lock
 * also freezes the other two first slides.
 */

export type Locks = [boolean, boolean, boolean];

export const isLocked = (p: Pick<Project, 'locked'> | null | undefined, i: number) =>
	!!p?.locked?.[i];

export const anyLocked = (p: Pick<Project, 'locked'> | null | undefined) =>
	[0, 1, 2].some((i) => isLocked(p, i));

export function withLock(p: Pick<Project, 'locked'>, i: number, on: boolean): Locks {
	const next: Locks = [isLocked(p, 0), isLocked(p, 1), isLocked(p, 2)];
	next[i] = on;
	return next;
}

/** The first locked carousel (0–2) that uses this photo, or -1. */
export function lockedCarouselUsing(p: Project, photoId: PhotoId): number {
	return (p.carousels ?? []).findIndex((c, i) => isLocked(p, i) && photosIn(c).includes(photoId));
}

export const isSplitRow = (p: Pick<Project, 'row'> | null | undefined) => p?.row?.mode === 'split';

/** The locked carousel, other than `i`, that holds the split panorama still; -1 if none. */
export function otherLocked(p: Project, i: number): number {
	return [0, 1, 2].find((j) => j !== i && isLocked(p, j)) ?? -1;
}

const sameCrop = (a: Background, b: Background) =>
	a.crop.fx === b.crop.fx && a.crop.fy === b.crop.fy && a.crop.zoom === b.crop.zoom;

/** True when slide 1's background looks different (photo, crop, edges or border). */
export function tileChanged(a: Background | undefined, b: Background | undefined): boolean {
	if (!a || !b) return a !== b;
	return (
		a.photoId !== b.photoId ||
		a.x0 !== b.x0 ||
		a.x1 !== b.x1 ||
		(a.border ?? 0) !== (b.border ?? 0) ||
		!sameCrop(a, b)
	);
}

/**
 * Check an edit to carousel `i` of a split-row project. Slide 1 keeps its edges and border,
 * and its crop is snapped so it still lines up with a whole panorama. Returns the (possibly
 * adjusted) carousel, or the reason the edit isn't allowed.
 */
export function guardSplitTile(
	project: Project,
	i: number,
	prev: Carousel,
	next: Carousel,
	sizeOf: (id: PhotoId) => PhotoSize | undefined
): Carousel | string {
	const a = prev.backgrounds[0];
	const b = next.backgrounds[0];
	if (!tileChanged(a, b)) return next;
	const locked = otherLocked(project, i);
	if (locked >= 0)
		return `Carousel ${locked + 1} is locked. Unlock it to change the split panorama.`;
	if (!a || !b || a.x0 !== b.x0 || a.x1 !== b.x1 || (a.border ?? 0) !== (b.border ?? 0))
		return 'Slide 1 is part of the split panorama, so its edges and border stay as they are.';
	if (!b.photoId) return 'Slide 1 is part of the split panorama. Replace its photo instead.';
	const size = sizeOf(b.photoId);
	if (!size) return next;
	const crop = snapTileCrop(size, b.crop, i);
	const backgrounds = [...next.backgrounds];
	backgrounds[0] = { ...b, crop };
	return { ...next, backgrounds };
}

/**
 * The split row implied by carousel `i`'s first slide, and all three carousels with their
 * first slides recut from it, so they line up again.
 */
export function syncSplitRow(
	carousels: [Carousel, Carousel, Carousel],
	i: number,
	sizeOf: (id: PhotoId) => PhotoSize
): { row: GridRow; carousels: [Carousel, Carousel, Carousel] } | null {
	const tile = carousels[i].backgrounds[0];
	if (!tile?.photoId) return null;
	const row: GridRow = {
		mode: 'split',
		photoId: tile.photoId,
		crop: panoramaCropFromTile(sizeOf(tile.photoId), tile.crop, i)
	};
	const tiles = rowTiles(row, sizeOf);
	const next = carousels.map((c, j) => {
		const b = c.backgrounds[0];
		if (!b) return c;
		const backgrounds = [...c.backgrounds];
		backgrounds[0] = { ...b, photoId: row.photoId, crop: tiles[j].crop };
		return { ...c, backgrounds };
	}) as [Carousel, Carousel, Carousel];
	return { row, carousels: next };
}
