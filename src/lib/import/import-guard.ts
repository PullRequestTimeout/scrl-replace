import type { ProjectId } from '#lib/model/types.ts';

/**
 * A record of the import in progress, kept in localStorage while photos are being processed.
 * When iOS runs out of memory it kills the page and reloads it, so nothing can catch the crash
 * itself; a marker still present on the next launch means the last import never finished.
 */
export interface ImportMarker {
	projectId: ProjectId;
	/** Photos stored so far in this import. */
	done: number;
	total: number;
	/** The file being processed when the marker was last written. */
	current: string;
}

const KEY = 'import:in-progress';

/** A photo taking longer than this is treated as stuck. Typical imports take 1–3 s per photo. */
export const STALL_MS = 30_000;

export function writeImportMarker(marker: ImportMarker) {
	try {
		localStorage.setItem(KEY, JSON.stringify(marker));
	} catch {
		// Blocked storage: crash detection just won't work.
	}
}

export function clearImportMarker() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Blocked storage: nothing was written either.
	}
}

/** Read and clear the marker left by an import that didn't finish, if any. */
export function takeInterruptedImport(): ImportMarker | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		localStorage.removeItem(KEY);
		const m = JSON.parse(raw) as Partial<ImportMarker>;
		if (typeof m.projectId !== 'string' || typeof m.current !== 'string') return null;
		return {
			projectId: m.projectId,
			done: Number(m.done) || 0,
			total: Number(m.total) || 0,
			current: m.current
		};
	} catch {
		return null;
	}
}
