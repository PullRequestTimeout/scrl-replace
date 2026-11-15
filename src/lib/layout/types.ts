import { ANALYSIS_VERSION, type PhotoAnalysis } from '#lib/analysis/types.ts';
import { isSubjectDetectionOn, SUBJECT_VERSION } from '#lib/ai/prefs.ts';
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
	/**
	 * How prominent a spot the photo deserves: 0 = background material that's fine to cover
	 * (mist, a texture, a guest book), 1 = a strong subject. Undefined when nothing is known,
	 * in which case every rule behaves as it did before subject detection.
	 */
	prominence?: number;
}

export const aspectOf = (p: Pick<LayoutPhoto, 'width' | 'height'>) => p.width / p.height;

export const hasCurrentAnalysis = (p: Photo) => p.analysis?.version === ANALYSIS_VERSION;

/**
 * A strong subject that only fills a small part of the frame (a rider deep in a wide forest)
 * still leaves plenty of space to cover, so wide shots count for less.
 */
const SHOT_SCALE = { wide: 0.55, medium: 0.85, close: 1 } as const;

/** Prominence from your tag, else from subject detection (when it's on), else unknown. */
export function prominenceOf(p: Photo, useSubjects: boolean): number | undefined {
	if (p.role === 'hero') return 1;
	if (p.role === 'background') return 0;
	if (!useSubjects || p.subject?.version !== SUBJECT_VERSION || !p.analysis) return undefined;
	return p.subject.strength * SHOT_SCALE[p.analysis.shot];
}

/** Photos with current analysis, in the shape the engine wants (plain objects for the worker). */
export function toLayoutPhotos(
	photos: Photo[],
	useSubjects = isSubjectDetectionOn()
): LayoutPhoto[] {
	return photos.filter(hasCurrentAnalysis).map((p) => ({
		id: p.id,
		width: p.width,
		height: p.height,
		workingWidth: p.workingWidth,
		workingHeight: p.workingHeight,
		analysis: JSON.parse(JSON.stringify(p.analysis)) as PhotoAnalysis,
		capturedAt: p.capturedAt,
		importIndex: p.importIndex,
		prominence: prominenceOf(p, useSubjects)
	}));
}
