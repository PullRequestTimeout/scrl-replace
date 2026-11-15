/**
 * Small, dependency-free pieces of subject detection that the layout engine and storage can
 * import without pulling in the model code.
 */

/** Bump when the model, prompts or scoring change, so stored results are recomputed. */
export const SUBJECT_VERSION = 1;

export const SUBJECT_PREF_KEY = 'pref:subject-detection';

/** Whether subject detection is turned on (main thread only; false where storage is blocked). */
export function isSubjectDetectionOn(): boolean {
	try {
		return localStorage.getItem(SUBJECT_PREF_KEY) === 'on';
	} catch {
		return false;
	}
}
