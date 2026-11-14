import type { PhotoId } from '#lib/model/types.ts';
import type { ImageVariant } from '#lib/model/constants.ts';
import { getBlob } from '#lib/storage/projects.ts';

/** One object URL per stored image, shared by every component that shows it. */
const urls = new Map<string, Promise<string | undefined>>();

export function imageUrl(photoId: PhotoId, variant: ImageVariant): Promise<string | undefined> {
	const key = `${photoId}/${variant}`;
	let url = urls.get(key);
	if (!url) {
		url = getBlob(photoId, variant).then((blob) => (blob ? URL.createObjectURL(blob) : undefined));
		urls.set(key, url);
	}
	return url;
}

export function revokeImageUrls(photoId: PhotoId) {
	for (const variant of ['working', 'preview', 'thumb'] as const) {
		const key = `${photoId}/${variant}`;
		void urls.get(key)?.then((u) => u && URL.revokeObjectURL(u));
		urls.delete(key);
	}
}
