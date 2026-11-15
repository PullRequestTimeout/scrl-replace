import type { Photo, Project, ProjectId } from '#lib/model/types.ts';
import { getPhotos, getProject, saveProject, savePhotoAnalyses } from '#lib/storage/projects.ts';
import { hasCurrentAnalysis } from '#lib/layout/types.ts';
import { imageWorker } from '#lib/workers/client.ts';
import { hasCurrentSubject, subjectDetection } from '#lib/ai/detection.svelte.ts';
import { isSubjectDetectionOn } from '#lib/ai/prefs.ts';

/** Longest suggestions wait for subject detection (the first model load is a few seconds). */
const SUBJECT_WAIT_MS = 20_000;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
	Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
import { buildReferenceCarousels, matchReferencePhotos } from '#lib/fixtures/reference.ts';
import type { ReferencePhoto } from '#lib/fixtures/reference-carousels.ts';
import { getPreset } from '#lib/storage/presets.ts';
import type { StylePreset } from '#lib/model/presets.ts';

/** A project and its photos, loaded for one screen. */
export class ProjectData {
	project = $state<Project | null>(null);
	photos = $state<Photo[]>([]);
	missing = $state(false);
	loaded = $state(false);
	/** Reference projects only: photos still to import. */
	referenceMissing = $state<ReferencePhoto[]>([]);

	/** Fill for empty carousel backgrounds, from the project's style preset. */
	emptyFill = $state('#ffffff');

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
		await this.refreshPreset();
		if (project.kind === 'reference') await this.syncReference();
		this.loaded = true;
	}

	/** Re-read the project's style preset (call after the project's style changes). */
	async refreshPreset() {
		this.emptyFill = (await getPreset(this.project?.presetId)).emptyBackground;
	}

	/** Photos analysed so far / needing analysis, for progress display. */
	analysing = $state<{ done: number; total: number } | null>(null);

	/**
	 * Analyse any photos imported before analysis existed (or with an outdated version), and
	 * run subject detection when it's on. Suggestions wait for detection, but never longer than
	 * SUBJECT_WAIT_MS: past that, or if it fails, they go ahead without it.
	 */
	async ensureAnalysis() {
		const subjects = withTimeout(
			subjectDetection.ensureSubjects($state.snapshot(this.photos)),
			SUBJECT_WAIT_MS
		);
		const missing = this.photos.filter((p) => !hasCurrentAnalysis(p));
		if (missing.length) {
			this.analysing = { done: 0, total: missing.length };
			const BATCH = 4;
			for (let i = 0; i < missing.length; i += BATCH) {
				const ids = missing.slice(i, i + BATCH).map((p) => p.id);
				const results = await imageWorker().analyzeStored(ids);
				await savePhotoAnalyses(results);
				this.photos = this.photos.map((p) =>
					results[p.id] ? { ...p, analysis: results[p.id] } : p
				);
				this.analysing = { done: Math.min(missing.length, i + BATCH), total: missing.length };
			}
		}
		const needing = this.photos.filter((p) => !hasCurrentSubject(p)).length;
		if (needing && isSubjectDetectionOn()) this.analysing = { done: 0, total: needing };
		const found = await subjects;
		if (found && Object.keys(found).length) {
			this.photos = this.photos.map((p) => (found[p.id] ? { ...p, subject: found[p.id] } : p));
		}
		this.analysing = null;
	}

	/** The project's style preset (the default if it was deleted), ready to send to the worker. */
	preset(): Promise<StylePreset> {
		return getPreset(this.project?.presetId);
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
