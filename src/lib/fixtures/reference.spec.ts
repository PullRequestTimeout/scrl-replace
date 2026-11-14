import { describe, expect, it } from 'vitest';
import type { Photo } from '#lib/model/types.ts';
import { structuralErrors } from '#lib/model/layout.ts';
import { REFERENCE_CAROUSELS } from './reference-carousels.ts';
import { buildReferenceCarousels, matchReferencePhotos } from './reference.ts';

function photo(name: string, width: number, height: number, exifDate?: string): Photo {
	return {
		id: `id-${name}`,
		name,
		width,
		height,
		workingWidth: width,
		workingHeight: height,
		exifDate,
		importedAt: 0,
		importIndex: 0,
		fileSize: 0
	};
}

describe('matchReferencePhotos', () => {
	it('matches by file name, ignoring case and extension', () => {
		const refs = REFERENCE_CAROUSELS.photos;
		const photos = refs.map((r) =>
			photo(r.name.toUpperCase().replace('.JPG', '.jpeg'), r.width, r.height)
		);
		const { matches, missing } = matchReferencePhotos(photos);
		expect(missing).toEqual([]);
		expect(matches.size).toBe(refs.length);
	});

	it('falls back to EXIF date and aspect when the picker renamed files', () => {
		const refs = REFERENCE_CAROUSELS.photos;
		// Downsized by the picker, renamed, same aspect and EXIF date.
		const photos = refs.map((r, i) =>
			photo(
				`IMG_${1000 + i}.jpeg`,
				Math.round(r.width / 2),
				Math.round(r.height / 2),
				r.exifDate ?? undefined
			)
		);
		const { missing } = matchReferencePhotos(photos);
		expect(missing).toEqual([]);
	});

	it('reports what is missing', () => {
		const { missing } = matchReferencePhotos([]);
		expect(missing).toHaveLength(REFERENCE_CAROUSELS.photos.length);
	});
});

describe('buildReferenceCarousels', () => {
	it('builds three valid carousels once all photos match', () => {
		const photos = REFERENCE_CAROUSELS.photos.map((r) => photo(r.name, r.width, r.height));
		const carousels = buildReferenceCarousels(matchReferencePhotos(photos).matches);
		expect(carousels).not.toBeNull();
		expect(carousels!.map((c) => c.slideCount)).toEqual([4, 6, 5]);
		for (const c of carousels!) expect(structuralErrors(c)).toEqual([]);
	});

	it('returns null while photos are missing', () => {
		expect(buildReferenceCarousels(new Map())).toBeNull();
	});
});
