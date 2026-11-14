import type { Carousel } from '#lib/model/layout.ts';
import type { Photo, PhotoId } from '#lib/model/types.ts';
import { REFERENCE_CAROUSELS, type ReferencePhoto } from './reference-carousels.ts';

export const REFERENCE_PROJECT_NAME = 'SCRL reference';

const stem = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase();

/**
 * Match imported photos to the reference photo list. File names survive some import paths but
 * not all (the iOS picker can rename files), so fall back to EXIF date + aspect ratio.
 */
export function matchReferencePhotos(photos: Photo[]): {
	matches: Map<string, PhotoId>;
	missing: ReferencePhoto[];
} {
	const matches = new Map<string, PhotoId>();
	const used = new Set<PhotoId>();
	const refs = REFERENCE_CAROUSELS.photos;

	for (const ref of refs) {
		const byName = photos.find((p) => !used.has(p.id) && stem(p.name) === stem(ref.name));
		if (byName) {
			matches.set(ref.name, byName.id);
			used.add(byName.id);
		}
	}
	for (const ref of refs) {
		if (matches.has(ref.name) || !ref.exifDate) continue;
		const aspect = ref.width / ref.height;
		const byExif = photos.find(
			(p) =>
				!used.has(p.id) &&
				p.exifDate === ref.exifDate &&
				Math.abs(p.width / p.height - aspect) < 0.01
		);
		if (byExif) {
			matches.set(ref.name, byExif.id);
			used.add(byExif.id);
		}
	}
	return { matches, missing: refs.filter((r) => !matches.has(r.name)) };
}

/** Build the three reference carousels once every photo is matched. */
export function buildReferenceCarousels(
	matches: Map<string, PhotoId>
): [Carousel, Carousel, Carousel] | null {
	if (REFERENCE_CAROUSELS.photos.some((p) => !matches.has(p.name))) return null;
	const id = (name: string) => matches.get(name)!;
	const carousels = REFERENCE_CAROUSELS.carousels.map((ref, ci): Carousel => ({
		slideCount: ref.slideCount,
		backgrounds: ref.backgrounds.map((b) => ({
			photoId: id(b.photo),
			x0: b.x0,
			x1: b.x1,
			crop: { ...b.crop }
		})),
		frames: ref.frames.map((f, fi) => ({
			id: `ref-${ci}-${fi}`,
			photoId: id(f.photo),
			x: f.x,
			y: f.y,
			h: f.h,
			aspect: f.aspect,
			border: f.border,
			crop: { ...f.crop }
		}))
	}));
	return carousels as [Carousel, Carousel, Carousel];
}
