import type { Photo, ProjectId } from '#lib/model/types.ts';
import { newId } from '#lib/storage/db.ts';
import { addPhotoToProject } from '#lib/storage/projects.ts';
import { requestPersistentStorage } from '#lib/storage/persist.ts';
import { processImageFile } from '#lib/workers/client.ts';

export interface ImportFailure {
	name: string;
	reason: string;
}

/**
 * Imports picked files one at a time. Sequential on purpose: decoding several 45 MP photos
 * at once would blow through iOS's memory limit.
 */
export class Importer {
	total = $state(0);
	done = $state(0);
	current = $state<string | null>(null);
	failures = $state<ImportFailure[]>([]);
	running = $derived(this.current !== null);
	progress = $derived(this.total ? this.done / this.total : 0);

	#queue: File[] = [];
	#projectId: ProjectId;
	#startIndex: () => number;
	#onPhoto: (photo: Photo) => void;

	/**
	 * @param startIndex returns the next import index (the project's current photo count)
	 * @param onPhoto called after each photo is stored
	 */
	constructor(projectId: ProjectId, startIndex: () => number, onPhoto: (photo: Photo) => void) {
		this.#projectId = projectId;
		this.#startIndex = startIndex;
		this.#onPhoto = onPhoto;
	}

	add(files: FileList | File[]) {
		const images = [...files].filter(
			(f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)
		);
		if (!images.length) return;
		if (!this.running) {
			this.total = 0;
			this.done = 0;
			this.failures = [];
		}
		this.total += images.length;
		this.#queue.push(...images);
		if (!this.running) void this.#run();
	}

	async #run() {
		void requestPersistentStorage();
		let index = this.#startIndex();
		while (this.#queue.length) {
			const file = this.#queue.shift()!;
			this.current = file.name;
			try {
				const processed = await processImageFile(file);
				const photo: Photo = {
					id: newId(),
					name: file.name,
					width: processed.width,
					height: processed.height,
					workingWidth: processed.workingWidth,
					workingHeight: processed.workingHeight,
					capturedAt: processed.capturedAt,
					importedAt: Date.now(),
					importIndex: index++,
					fileSize: file.size
				};
				await addPhotoToProject(this.#projectId, photo, processed.blobs);
				this.#onPhoto(photo);
			} catch (error) {
				console.error(error);
				this.failures.push({
					name: file.name,
					reason: error instanceof Error ? error.message : String(error)
				});
			}
			this.done++;
		}
		this.current = null;
	}
}
