/**
 * Saving to Photos from a web app goes through the share sheet ("Save N Images").
 * iOS only allows `navigator.share` during a user tap, and the tap "expires" after any
 * awaited work, so files must be ready before the button is pressed and `shareFiles`
 * must be called directly from the click handler.
 */
export function canShareFiles(files: File[]): boolean {
	try {
		return typeof navigator.canShare === 'function' && navigator.canShare({ files });
	} catch {
		return false;
	}
}

export type ShareResult = 'shared' | 'cancelled' | 'failed';

export async function shareFiles(files: File[]): Promise<ShareResult> {
	try {
		await navigator.share({ files });
		return 'shared';
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		console.error('Share failed', error);
		return 'failed';
	}
}

/** Desktop fallback: download each file, spaced out so the browser doesn't drop any. */
export async function downloadFiles(files: File[]) {
	for (const [i, file] of files.entries()) {
		if (i > 0) await new Promise((r) => setTimeout(r, 250));
		const url = URL.createObjectURL(file);
		const a = document.createElement('a');
		a.href = url;
		a.download = file.name;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}
}

/** Posting order: the profile grid is newest-first, so the right-hand tile is posted first. */
export const POSTING_ORDER = [2, 1, 0] as const;
export const TILE_NAMES = ['left', 'middle', 'right'] as const;

export function slideFileName(postNumber: number, slide: number): string {
	return `post${postNumber}-slide${String(slide + 1).padStart(2, '0')}.jpg`;
}
