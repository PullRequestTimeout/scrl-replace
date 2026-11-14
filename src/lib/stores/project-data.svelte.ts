import type { Photo, Project, ProjectId } from '#lib/model/types.ts';
import { getPhotos, getProject, saveProject } from '#lib/storage/projects.ts';
import { buildReferenceCarousels, matchReferencePhotos } from '#lib/fixtures/reference.ts';
import type { ReferencePhoto } from '#lib/fixtures/reference-carousels.ts';

/** A project and its photos, loaded for one screen. */
export class ProjectData {
	project = $state<Project | null>(null);
	photos = $state<Photo[]>([]);
	missing = $state(false);
	loaded = $state(false);
	/** Reference projects only: photos still to import. */
	referenceMissing = $state<ReferencePhoto[]>([]);

	#id: ProjectId;

	constructor(id: ProjectId) {
		this.#id = id;
	}

	async load() {
		const project = await getProject(this.#id);
		if (!project) {
			this.missing = true;
			this.loaded = true;
			return;
		}
		this.photos = await getPhotos(project.photoIds);
		this.project = project;
		if (project.kind === 'reference') await this.syncReference();
		this.loaded = true;
	}

	photoMap(): Map<string, Photo> {
		return new Map(this.photos.map((p) => [p.id, p]));
	}

	/** Rebuild reference carousels from whatever photos are imported so far. */
	async syncReference() {
		if (!this.project) return;
		const { matches, missing } = matchReferencePhotos(this.photos);
		this.referenceMissing = missing;
		const carousels = buildReferenceCarousels(matches);
		const changed = JSON.stringify(carousels) !== JSON.stringify(this.project.carousels);
		if (changed) this.project = await saveProject({ ...this.project, carousels });
	}
}
