import type { Photo, ProjectId } from '#lib/model/types.ts';
import { newId } from '#lib/storage/db.ts';
import { addPhotoToProject } from '#lib/storage/projects.ts';
import { requestPersistentStorage } from '#lib/storage/persist.ts';
import { processImageFile } from '#lib/workers/client.ts';
import { getColorSpace } from '#lib/settings.ts';
import { clearImportMarker, STALL_MS, writeImportMarker } from './import-guard.ts';

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
	/** The current photo has taken more than STALL_MS: the worker may have crashed. */
	stalled = $state(false);
	/**
	 * The photo and saved count when the last stall was detected. Not cleared when the stall
	 * ends, so the warning's text stays put while it animates closed.
	 */
	stallInfo = $state({ name: '', stored: 0 });
	/** Photos stored so far in this run (failures excluded). */
	stored = $state(0);

	#queue: File[] = [];
	#stallTimer: ReturnType<typeof setTimeout> | undefined;
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
			this.stored = 0;
			this.failures = [];
		}
		this.total += images.length;
		this.#queue.push(...images);
		if (!this.running) void this.#run();
	}

	async #run() {
		void requestPersistentStorage();
		let index = this.#startIndex();
		const colorSpace = getColorSpace();
		while (this.#queue.length) {
			const file = this.#queue.shift()!;
			this.current = file.name;
			writeImportMarker({
				projectId: this.#projectId,
				done: this.stored,
				total: this.total,
				current: file.name
			});
			this.#armStallTimer();
			try {
				const processed = await processImageFile(file, colorSpace);
				const photo: Photo = {
					id: newId(),
					name: file.name,
					width: processed.width,
					height: processed.height,
					workingWidth: processed.workingWidth,
					workingHeight: processed.workingHeight,
					capturedAt: processed.capturedAt,
					exifDate: processed.exifDate,
					analysis: processed.analysis,
					importedAt: Date.now(),
					importIndex: index++,
					fileSize: file.size
				};
				await addPhotoToProject(this.#projectId, photo, processed.blobs);
				this.stored++;
				this.#onPhoto(photo);
			} catch (error) {
				console.error(error);
				this.failures.push({
					name: file.name,
					reason: error instanceof Error ? error.message : String(error)
				});
			}
			clearTimeout(this.#stallTimer);
			this.stalled = false;
			this.done++;
		}
		this.current = null;
		clearImportMarker();
	}

	/** "Keep waiting": hide the warning, and show it again if the photo stays stuck. */
	keepWaiting() {
		this.stalled = false;
		if (this.running) this.#armStallTimer();
	}

	#armStallTimer() {
		clearTimeout(this.#stallTimer);
		this.#stallTimer = setTimeout(() => {
			this.stallInfo = { name: this.current ?? '', stored: this.stored };
			this.stalled = true;
		}, STALL_MS);
	}
}
