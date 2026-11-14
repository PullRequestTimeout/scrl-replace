import type { Photo, PhotoId } from '#lib/model/types.ts';
import { getBlob } from '#lib/storage/projects.ts';
import type { DrawSource } from './draw.ts';

/**
 * Decoded preview-size images (1024px) for on-screen drawing, capped so a long session can't
 * exhaust iOS memory. Least recently used images are released first.
 */
const MAX = 30; // a whole project (up to ~25 photos) stays decoded on the overview screen
const cache = new Map<PhotoId, Promise<ImageBitmap | undefined>>();

async function decode(id: PhotoId): Promise<ImageBitmap | undefined> {
	const blob = await getBlob(id, 'preview');
	return blob ? createImageBitmap(blob) : undefined;
}

function touch(id: PhotoId): Promise<ImageBitmap | undefined> {
	let entry = cache.get(id);
	if (entry) {
		cache.delete(id);
	} else {
		entry = decode(id).catch(() => undefined);
	}
	cache.set(id, entry);
	while (cache.size > MAX) {
		const [oldId, old] = cache.entries().next().value!;
		cache.delete(oldId);
		void old.then((b) => b?.close());
	}
	return entry;
}

/** Load preview sources for the given photos. Missing images are simply absent from the map. */
export async function loadPreviewSources(photos: Photo[]): Promise<Map<PhotoId, DrawSource>> {
	const entries = await Promise.all(
		photos.map(async (p) => {
			const image = await touch(p.id);
			if (!image) return null;
			const source: DrawSource = {
				image,
				imageW: image.width,
				imageH: image.height,
				photoW: p.width,
				photoH: p.height
			};
			return [p.id, source] as const;
		})
	);
	return new Map(entries.filter((e) => e !== null));
}
