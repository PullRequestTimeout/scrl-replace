import { clamp, cropSource, type Crop } from '#lib/model/layout.ts';

/**
 * Crop maths for dragging a photo inside its box. Works from the *effective* centre (after
 * clamping) so a stored focus point outside the reachable range doesn't cause a dead zone.
 */
export function effectiveCrop(
	photoW: number,
	photoH: number,
	boxW: number,
	boxH: number,
	crop: Crop
): Crop {
	const src = cropSource(photoW, photoH, boxW, boxH, crop);
	return {
		fx: (src.x + src.w / 2) / photoW,
		fy: (src.y + src.h / 2) / photoH,
		zoom: Math.max(1, crop.zoom)
	};
}

/** Pan: the photo follows the finger, so the focus point moves the opposite way. */
export function panCrop(
	photoW: number,
	photoH: number,
	boxW: number,
	boxH: number,
	start: Crop,
	dxStrip: number,
	dyStrip: number
): Crop {
	const base = effectiveCrop(photoW, photoH, boxW, boxH, start);
	const src = cropSource(photoW, photoH, boxW, boxH, base);
	const fx = base.fx - (dxStrip * (src.w / boxW)) / photoW;
	const fy = base.fy - (dyStrip * (src.h / boxH)) / photoH;
	const hx = src.w / 2 / photoW;
	const hy = src.h / 2 / photoH;
	return {
		fx: clamp(fx, hx, 1 - hx),
		fy: clamp(fy, hy, 1 - hy),
		zoom: base.zoom
	};
}

export const MAX_ZOOM = 5;

/** Zoom around the current centre, then re-clamp the centre for the new visible size. */
export function zoomCrop(
	photoW: number,
	photoH: number,
	boxW: number,
	boxH: number,
	start: Crop,
	zoom: number
): Crop {
	const base = effectiveCrop(photoW, photoH, boxW, boxH, start);
	return effectiveCrop(photoW, photoH, boxW, boxH, { ...base, zoom: clamp(zoom, 1, MAX_ZOOM) });
}
