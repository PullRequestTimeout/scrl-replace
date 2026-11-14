import type { Orientation } from '#lib/model/types.ts';
import { SPLIT_SOURCE_W } from '#lib/model/constants.ts';

export interface Size {
	width: number;
	height: number;
}

/** Scale `size` down (never up) so its long edge is at most `longEdge`. */
export function fitWithin(size: Size, longEdge: number): Size {
	const scale = Math.min(1, longEdge / Math.max(size.width, size.height));
	return {
		width: Math.max(1, Math.round(size.width * scale)),
		height: Math.max(1, Math.round(size.height * scale))
	};
}

/**
 * Intermediate sizes for a high-quality downscale: halve while the source is more than
 * twice the target, then finish with one final draw. Returns every size to draw, ending
 * with `target`. Single-step draws from very large sources alias badly in canvas.
 */
export function downscaleSteps(source: Size, target: Size): Size[] {
	const steps: Size[] = [];
	let w = source.width;
	let h = source.height;
	while (w / 2 >= target.width * 2 && h / 2 >= target.height * 2) {
		w = Math.round(w / 2);
		h = Math.round(h / 2);
		steps.push({ width: w, height: h });
	}
	steps.push(target);
	return steps;
}

export function orientationOf(size: Size, squareTolerance = 0.05): Orientation {
	const aspect = size.width / size.height;
	if (Math.abs(aspect - 1) <= squareTolerance) return 'square';
	return aspect > 1 ? 'landscape' : 'portrait';
}

/**
 * Whether a photo has enough pixels to be cut into a 3-tile split row without upscaling.
 * The panorama crop is ~2.3:1, so the limiting dimension is the photo's width.
 */
export function canBeSplitRow(size: Size): boolean {
	return size.width >= SPLIT_SOURCE_W;
}
