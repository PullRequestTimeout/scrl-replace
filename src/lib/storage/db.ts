import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Photo, PhotoId, Project, ProjectId } from '#lib/model/types.ts';
import type { ImageVariant } from '#lib/model/constants.ts';

/**
 * Everything lives in IndexedDB, including image files: Safari stores Blobs in IndexedDB
 * reliably, which OPFS still does not do consistently across iOS versions.
 */
interface StripDB extends DBSchema {
	projects: { key: ProjectId; value: Project; indexes: { byUpdated: number } };
	photos: { key: PhotoId; value: Photo };
	/** Key: `${photoId}/${variant}` */
	blobs: { key: string; value: Blob };
}

const DB_NAME = 'strip';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<StripDB>> | undefined;

export function db(): Promise<IDBPDatabase<StripDB>> {
	dbPromise ??= openDB<StripDB>(DB_NAME, DB_VERSION, {
		upgrade(database, oldVersion) {
			if (oldVersion < 1) {
				const projects = database.createObjectStore('projects', { keyPath: 'id' });
				projects.createIndex('byUpdated', 'updatedAt');
				database.createObjectStore('photos', { keyPath: 'id' });
				database.createObjectStore('blobs');
			}
		},
		blocked() {
			console.warn('Database upgrade blocked by another open tab');
		}
	});
	return dbPromise;
}

export const blobKey = (photoId: PhotoId, variant: ImageVariant) => `${photoId}/${variant}`;

export function newId(): string {
	return crypto.randomUUID();
}
