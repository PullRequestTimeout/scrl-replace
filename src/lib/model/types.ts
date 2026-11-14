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
	/** Later phases: grid row, carousels and export state. */
	row: unknown | null;
	pinnedTiles: [PhotoId | null, PhotoId | null, PhotoId | null];
	carousels: unknown | null;
	exportState: { posted: [boolean, boolean, boolean] };
}
