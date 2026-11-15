/** Bump when analysis output changes, so stored results are recomputed. */
export const ANALYSIS_VERSION = 1;

/** RGBA pixels, e.g. from getImageData on a ~256px copy. */
export interface Pixels {
	data: Uint8ClampedArray | Uint8Array;
	width: number;
	height: number;
}

export interface Lab {
	l: number; // 0..100
	a: number;
	b: number;
}

/** A coarse saliency ("what stands out") map, long side SAL_GRID cells, values 0..255. */
export interface SaliencyMap {
	w: number;
	h: number;
	values: number[];
}

export interface PhotoAnalysis {
	version: number;
	isMono: boolean;
	/** Mean lightness 0..1 and its spread. */
	lumaMean: number;
	lumaStd: number;
	/** Mean chroma (colourfulness), roughly 0..60. */
	chroma: number;
	/** Warm (+) vs cool (−), mean of the Lab b axis plus a little of a. */
	warmth: number;
	/** Main colours, heaviest first, with their share of the image. */
	dominant: { lab: Lab; weight: number }[];
	saliency: {
		/** Weighted centre of what stands out, 0..1. */
		cx: number;
		cy: number;
		/** Box around the most salient region, 0..1. */
		box: { x: number; y: number; w: number; h: number };
		map: SaliencyMap;
	};
	/** Horizon height 0..1 if there's a clear one. */
	horizonY: number | null;
	shot: 'wide' | 'medium' | 'close';
	/** 64-bit difference hash, hex. Near-duplicates are within ~10 bits. */
	dhash: string;
}
