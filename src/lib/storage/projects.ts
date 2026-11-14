import type { Photo, PhotoId, Project, ProjectId } from '#lib/model/types.ts';
import type { ImageVariant } from '#lib/model/constants.ts';
import { blobKey, db, newId } from './db.ts';

const VARIANTS: ImageVariant[] = ['working', 'preview', 'thumb'];

export async function listProjects(): Promise<Project[]> {
	const all = await (await db()).getAllFromIndex('projects', 'byUpdated');
	return all.reverse();
}

export async function getProject(id: ProjectId): Promise<Project | undefined> {
	return (await db()).get('projects', id);
}

export async function createProject(name: string): Promise<Project> {
	const now = Date.now();
	const project: Project = {
		id: newId(),
		name,
		createdAt: now,
		updatedAt: now,
		photoIds: [],
		presetId: 'default',
		row: null,
		pinnedTiles: [null, null, null],
		carousels: null,
		exportState: { posted: [false, false, false] }
	};
	await (await db()).put('projects', project);
	return project;
}

export async function saveProject(project: Project): Promise<Project> {
	const updated = { ...toPlain(project), updatedAt: Date.now() };
	await (await db()).put('projects', updated);
	return updated;
}

export async function renameProject(id: ProjectId, name: string): Promise<void> {
	const project = await getProject(id);
	if (project) await saveProject({ ...project, name });
}

/**
 * Duplicating shares the photo records and their image files (they're immutable).
 * Files are only deleted when no project references them any more.
 */
export async function duplicateProject(id: ProjectId): Promise<Project | undefined> {
	const source = await getProject(id);
	if (!source) return;
	const now = Date.now();
	const copy: Project = {
		...structuredClone(source),
		id: newId(),
		name: `${source.name} (copy)`,
		createdAt: now,
		updatedAt: now
	};
	await (await db()).put('projects', copy);
	return copy;
}

export async function deleteProject(id: ProjectId): Promise<void> {
	const database = await db();
	const project = await database.get('projects', id);
	if (!project) return;
	await database.delete('projects', id);
	await deleteUnreferencedPhotos(project.photoIds);
}

/** Photos referenced by any remaining project. */
async function referencedPhotoIds(): Promise<Set<PhotoId>> {
	const projects = await (await db()).getAll('projects');
	return new Set(projects.flatMap((p) => p.photoIds));
}

export async function deleteUnreferencedPhotos(candidates: PhotoId[]): Promise<void> {
	const stillUsed = await referencedPhotoIds();
	const orphans = candidates.filter((id) => !stillUsed.has(id));
	if (!orphans.length) return;
	const tx = (await db()).transaction(['photos', 'blobs'], 'readwrite');
	for (const id of orphans) {
		tx.objectStore('photos').delete(id);
		for (const v of VARIANTS) tx.objectStore('blobs').delete(blobKey(id, v));
	}
	await tx.done;
}

// ---------------------------------------------------------------------------
// Photos

export async function getPhotos(ids: PhotoId[]): Promise<Photo[]> {
	const database = await db();
	const photos = await Promise.all(ids.map((id) => database.get('photos', id)));
	return photos.filter((p): p is Photo => !!p);
}

export async function getBlob(id: PhotoId, variant: ImageVariant): Promise<Blob | undefined> {
	return (await db()).get('blobs', blobKey(id, variant));
}

/** Store a processed photo and append it to the project in one transaction. */
export async function addPhotoToProject(
	projectId: ProjectId,
	photo: Photo,
	blobs: Record<ImageVariant, Blob>
): Promise<void> {
	const tx = (await db()).transaction(['projects', 'photos', 'blobs'], 'readwrite');
	const project = await tx.objectStore('projects').get(projectId);
	if (!project) {
		tx.abort();
		throw new Error('Project no longer exists');
	}
	await tx.objectStore('photos').put(photo);
	for (const v of VARIANTS) await tx.objectStore('blobs').put(blobs[v], blobKey(photo.id, v));
	project.photoIds.push(photo.id);
	project.updatedAt = Date.now();
	await tx.objectStore('projects').put(project);
	await tx.done;
}

export async function removePhotoFromProject(
	projectId: ProjectId,
	photoId: PhotoId
): Promise<void> {
	const database = await db();
	const project = await database.get('projects', projectId);
	if (!project) return;
	project.photoIds = project.photoIds.filter((id) => id !== photoId);
	project.pinnedTiles = project.pinnedTiles.map((t) =>
		t === photoId ? null : t
	) as Project['pinnedTiles'];
	project.updatedAt = Date.now();
	await database.put('projects', project);
	await deleteUnreferencedPhotos([photoId]);
}

/** Strip Svelte 5 state proxies before writing to IndexedDB (structured clone can't copy proxies). */
function toPlain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
