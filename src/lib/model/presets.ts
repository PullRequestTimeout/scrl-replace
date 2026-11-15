/**
 * Style presets: the numbers behind "your style". Soft rules from PLAN.md §2 become weighted
 * score terms; ranges drive generation. Phase 5 adds a UI to save and switch presets.
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
		contrast: 1,
		frameHeight: 1.5,
		bgSpan: 1,
		lastSlideCovered: 0.5,
		upscale: 2,
		adjacentDuplicate: 2,
		rhythm: 0.5,
		subjectCut: 1
	}
};
