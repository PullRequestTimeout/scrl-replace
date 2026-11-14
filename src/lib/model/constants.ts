/** Instagram 4:5 portrait slide, in output pixels. */
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

/** The profile grid shows a centred 3:4 crop of each 4:5 post. */
export const GRID_VISIBLE_W = (SLIDE_H * 3) / 4; // 1012.5
export const GRID_HIDDEN_SIDE = (SLIDE_W - GRID_VISIBLE_W) / 2; // 33.75

/** Source width a split panorama needs at output scale: 3 visible tiles + the hidden outer edges. */
export const SPLIT_SOURCE_W = GRID_VISIBLE_W * 3 + GRID_HIDDEN_SIDE * 2; // 3105

/** Stored image sizes (long edge, px). */
export const WORKING_LONG_EDGE = 3200;
export const PREVIEW_LONG_EDGE = 1024;
export const THUMB_LONG_EDGE = 256;

export const STORED_JPEG_QUALITY = 0.9;
export const EXPORT_JPEG_QUALITY = 0.92;

export type ImageVariant = 'working' | 'preview' | 'thumb';
