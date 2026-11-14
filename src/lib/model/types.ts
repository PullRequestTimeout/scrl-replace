import type { Carousel } from './layout.ts';

export type PhotoId = string;
export type ProjectId = string;

export type Orientation = 'landscape' | 'portrait' | 'square';

export interface Photo {
	id: PhotoId;
	name: string;
	/** Original pixel size (after EXIF orientation is applied). */
	width: number;
	height: number;
	/** Size of the stored working copy. */
	workingWidth: number;
	workingHeight: number;
	/** EXIF capture time (ms since epoch) if the file had one. Optional by design. */
	capturedAt?: number;
	/** Raw EXIF DateTimeOriginal ("YYYY:MM:DD HH:MM:SS"), timezone-free. Used to match reference photos. */
	exifDate?: string;
	importedAt: number;
	/** Position in the original import, used as the neutral ordering when capture time is missing. */
	importIndex: number;
	fileSize: number;
	/** Filled in by the analysis pass (Phase 4). */
	analysis?: unknown;
}

export interface Project {
	id: ProjectId;
	name: string;
	createdAt: number;
	updatedAt: number;
	photoIds: PhotoId[];
	presetId: string;
	/** 'reference' = rebuilt from your SCRL originals, used to calibrate and test. */
	kind?: 'reference';
	/** Phase 4: grid row choice. */
	row: unknown | null;
	pinnedTiles: [PhotoId | null, PhotoId | null, PhotoId | null];
	/** Left, middle, right: each carousel's first slide is that grid tile. */
	carousels: [Carousel, Carousel, Carousel] | null;
	exportState: { posted: [boolean, boolean, boolean] };
}
