/**
 * When subject detection has got slow enough on this device to suggest turning it off.
 * Pure rules, so they can be tested; detection.svelte.ts keeps the history and shows the prompt.
 */

/** Never call a run slow below this per-photo time: it's still a small wait over 25 photos. */
export const SLOW_FLOOR_MS = 1500;
/** Loading the stored model normally takes a few seconds; far longer means trouble. */
export const SLOW_LOAD_MS = 15_000;
/** A run that hasn't finished by now is treated as stuck. */
export const STALL_MS = 30_000;
/** Runs remembered, and how many of them must be slow before asking. */
export const HISTORY = 3;
export const SLOW_TO_WARN = 2;
/** After "Keep it on", don't ask about slowness again for this long. */
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export interface RunTiming {
	/** Median time per photo (decode + model), ms. */
	perPhotoMs: number;
	/** Model load time this run, ms (0 when it was already loaded). */
	loadMs: number;
}

/**
 * Per-photo time that counts as slow: well past what the speed test measured when it was
 * turned on (it only times the model, so decoding the photo gets some allowance).
 */
export function slowThreshold(benchmarkMs: number | null): number {
	return Math.max(SLOW_FLOOR_MS, 3 * (benchmarkMs ?? 300) + 200);
}

export function isSlowRun(run: RunTiming, benchmarkMs: number | null): boolean {
	return run.perPhotoMs > slowThreshold(benchmarkMs) || run.loadMs > SLOW_LOAD_MS;
}

/** Add a run to the history (newest last) and say whether to ask about turning it off. */
export function recordRun(
	history: boolean[],
	slow: boolean
): { history: boolean[]; warn: boolean } {
	const next = [...history, slow].slice(-HISTORY);
	return { history: next, warn: next.filter(Boolean).length >= SLOW_TO_WARN };
}

export function median(xs: number[]): number {
	if (!xs.length) return 0;
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}
