/**
 * Style presets: the numbers behind "your style". Soft rules from PLAN.md §2 become weighted
 * score terms; ranges drive generation. The built-in default is read-only (the calibration
 * tests measure it); your own presets are copies of it, stored in IndexedDB.
 */
export interface StylePreset {
	id: string;
	name: string;
	/** Border as a fraction of the frame's outer height (measured ~3% in the reference posts). */
	borderRatio: number;
	/** Frame outer height as a fraction of the slide height. */
	frameHeight: [number, number];
	/** Background spans, in slides. */
	bgSpanLandscape: [number, number];
	bgSpanPortrait: [number, number];
	bgSpanSquare: [number, number];
	/** Joins not covered by a frame should be at least this far from a slide edge (px). */
	joinClearance: number;
	/** Frames keep this far from the top and bottom of the slide (px). */
	frameMargin: number;
	/** Minimum gap between frames, as a fraction of a slide. */
	frameGap: number;
	weights: ScoreWeights;
}

export interface ScoreWeights {
	/** Reward joins hidden under frames (R9). */
	joinCovered: number;
	/** Penalise visible joins close to a slide edge (R6). */
	joinNearEdge: number;
	/**
	 * Reward frames centred on a slide (5 of 6 frames in the reference posts), or failing
	 * that, crossing a slide edge with enough on each side (R8).
	 */
	framePlacement: number;
	/** Penalise frames covering the subject of the background behind (R12). */
	frameCoversSubject: number;
	/** Penalise any background left mostly hidden behind frames (worst one, past 55%). */
	backgroundHidden: number;
	/** Reward colour/B&W or tonal contrast between a frame and its background (R13). */
	contrast: number;
	/** Penalise frames outside the preferred height range (R11). */
	frameHeight: number;
	/** Penalise backgrounds outside their span range (R5). */
	bgSpan: number;
	/** Penalise frames covering the last slide (R4). */
	lastSlideCovered: number;
	/** Penalise enlarging a photo past its stored resolution at export size. */
	upscale: number;
	/** Penalise near-duplicates next to each other (R16). */
	adjacentDuplicate: number;
	/** Reward variety between neighbours (colour/B&W, shot type). */
	rhythm: number;
	/** Penalise a background's subject being cut by a slide edge. */
	subjectCut: number;
}

export const DEFAULT_PRESET: StylePreset = {
	id: 'default',
	name: 'My style',
	borderRatio: 0.03,
	frameHeight: [0.4, 0.9],
	bgSpanLandscape: [1.3, 2.2],
	bgSpanPortrait: [0.8, 1.1],
	bgSpanSquare: [1.0, 1.4],
	joinClearance: 120,
	frameMargin: 40,
	frameGap: 0.3,
	weights: {
		joinCovered: 2,
		joinNearEdge: 3,
		framePlacement: 2,
		frameCoversSubject: 3,
		backgroundHidden: 3,
		contrast: 2.5,
		frameHeight: 1.5,
		bgSpan: 1,
		lastSlideCovered: 0.5,
		upscale: 2,
		adjacentDuplicate: 2,
		rhythm: 0.5,
		subjectCut: 1
	}
};

export const DEFAULT_PRESET_ID = DEFAULT_PRESET.id;

type RangeKey = 'frameHeight' | 'bgSpanLandscape' | 'bgSpanPortrait' | 'bgSpanSquare';
type NumberKey = 'borderRatio' | 'joinClearance' | 'frameMargin' | 'frameGap';

/** Editable limits for each setting; the editor's sliders use these too. */
export const RANGE_LIMITS: Record<RangeKey, { min: number; max: number; step: number }> = {
	frameHeight: { min: 0.2, max: 1, step: 0.05 },
	bgSpanLandscape: { min: 0.5, max: 4, step: 0.1 },
	bgSpanPortrait: { min: 0.5, max: 4, step: 0.1 },
	bgSpanSquare: { min: 0.5, max: 4, step: 0.1 }
};
export const NUMBER_LIMITS: Record<NumberKey, { min: number; max: number; step: number }> = {
	borderRatio: { min: 0, max: 0.1, step: 0.005 },
	joinClearance: { min: 0, max: 300, step: 10 },
	frameMargin: { min: 0, max: 200, step: 10 },
	frameGap: { min: 0, max: 1, step: 0.05 }
};
export const WEIGHT_LIMITS = { min: 0, max: 5, step: 0.25 };

const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
	typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/**
 * A complete, valid preset from whatever was stored: missing settings (e.g. weights added in a
 * later version) come from the default, numbers are clamped and ranges kept in order.
 */
export function normalizePreset(raw: Partial<StylePreset> & { id: string }): StylePreset {
	const d = DEFAULT_PRESET;
	const out: StylePreset = structuredClone(d);
	out.id = raw.id;
	out.name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : d.name;
	for (const key of Object.keys(NUMBER_LIMITS) as NumberKey[]) {
		const { min, max } = NUMBER_LIMITS[key];
		out[key] = clamp(raw[key], min, max, d[key]);
	}
	for (const key of Object.keys(RANGE_LIMITS) as RangeKey[]) {
		const { min, max } = RANGE_LIMITS[key];
		const r = Array.isArray(raw[key]) ? raw[key] : d[key];
		const a = clamp(r[0], min, max, d[key][0]);
		const b = clamp(r[1], min, max, d[key][1]);
		out[key] = [Math.min(a, b), Math.max(a, b)];
	}
	for (const key of Object.keys(d.weights) as (keyof ScoreWeights)[]) {
		out.weights[key] = clamp(
			raw.weights?.[key],
			WEIGHT_LIMITS.min,
			WEIGHT_LIMITS.max,
			d.weights[key]
		);
	}
	return out;
}
