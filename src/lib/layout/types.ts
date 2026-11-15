import { ANALYSIS_VERSION, type PhotoAnalysis } from '#lib/analysis/types.ts';
import type { Photo, PhotoId } from '#lib/model/types.ts';

/** What the suggestion engine needs to know about a photo. */
export interface LayoutPhoto {
	id: PhotoId;
	width: number;
	height: number;
	/** Pixel width of the stored working copy (limits sharpness at export). */
	workingWidth: number;
	workingHeight: number;
	analysis: PhotoAnalysis;
	capturedAt?: number;
	importIndex: number;
}

export const aspectOf = (p: Pick<LayoutPhoto, 'width' | 'height'>) => p.width / p.height;

export const hasCurrentAnalysis = (p: Photo) => p.analysis?.version === ANALYSIS_VERSION;

/** Photos with current analysis, in the shape the engine wants (plain objects for the worker). */
export function toLayoutPhotos(photos: Photo[]): LayoutPhoto[] {
	return photos.filter(hasCurrentAnalysis).map((p) => ({
		id: p.id,
		width: p.width,
		height: p.height,
		workingWidth: p.workingWidth,
		workingHeight: p.workingHeight,
		analysis: JSON.parse(JSON.stringify(p.analysis)) as PhotoAnalysis,
		capturedAt: p.capturedAt,
		importIndex: p.importIndex
	}));
}
