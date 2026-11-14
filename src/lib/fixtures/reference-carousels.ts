/**
 * Your three reference carousels (the SCRL originals), rebuilt in the app's layout format.
 *
 * Measured from the exported strips: white frames and visible background joins were detected
 * automatically; each region was matched to its original in og-gallery/ and the cover crop
 * (focus + zoom) recovered by image correlation. Joins hidden under frames were solved the same way.
 * Generated once; edit by hand if needed. Photos are referenced by file name, capture time and
 * size so they can be matched after importing from the iOS photo picker.
 *
 * Carousel order is the grid row left to right.
 */
export interface ReferencePhoto {
	name: string;
	width: number;
	height: number;
	/** Raw EXIF DateTimeOriginal, "YYYY:MM:DD HH:MM:SS" (no timezone). */
	exifDate: string | null;
}

type Crop = { fx: number; fy: number; zoom: number };

export interface ReferenceCarousel {
	slideCount: number;
	backgrounds: { photo: string; x0: number; x1: number; crop: Crop }[];
	frames: {
		photo: string;
		x: number;
		y: number;
		h: number;
		border: number;
		aspect: number;
		crop: Crop;
	}[];
}

export const REFERENCE_CAROUSELS: { photos: ReferencePhoto[]; carousels: ReferenceCarousel[] } = {
	photos: [
		{
			name: 'DSC05327.jpg',
			width: 2087,
			height: 1499,
			exifDate: '2026:09:13 08:51:36'
		},
		{
			name: 'DSC05336.jpg',
			width: 3485,
			height: 2737,
			exifDate: '2026:09:13 08:59:51'
		},
		{
			name: 'DSC05337.jpg',
			width: 3471,
			height: 4628,
			exifDate: '2026:09:13 09:00:03'
		},
		{
			name: 'DSC05345.jpg',
			width: 3504,
			height: 4672,
			exifDate: '2026:09:13 09:03:26'
		},
		{
			name: 'DSC05350.jpg',
			width: 4420,
			height: 3179,
			exifDate: '2026:09:13 09:05:20'
		},
		{
			name: 'DSC05394.jpg',
			width: 4926,
			height: 3284,
			exifDate: '2026:09:13 09:45:33'
		},
		{
			name: 'DSC05400.jpg',
			width: 3504,
			height: 5256,
			exifDate: '2026:09:13 09:47:05'
		},
		{
			name: 'DSC05432-Edit.jpg',
			width: 3504,
			height: 4672,
			exifDate: '2026:09:13 10:01:54'
		},
		{
			name: 'DSC05441.jpg',
			width: 3504,
			height: 4672,
			exifDate: '2026:09:13 10:02:41'
		},
		{
			name: 'DSC05469.jpg',
			width: 4409,
			height: 3040,
			exifDate: '2026:09:13 10:08:10'
		},
		{
			name: 'DSC05487.jpg',
			width: 3504,
			height: 4672,
			exifDate: '2026:09:13 10:13:40'
		},
		{
			name: 'DSC05511.jpg',
			width: 5256,
			height: 3504,
			exifDate: '2026:09:13 10:16:18'
		},
		{
			name: 'DSC05557-Enhanced-NR.jpg',
			width: 3504,
			height: 4672,
			exifDate: '2026:09:13 10:42:23'
		},
		{
			name: 'DSC05563-Enhanced-NR.jpg',
			width: 3260,
			height: 4075,
			exifDate: '2026:09:13 10:42:45'
		},
		{
			name: 'DSC05605.jpg',
			width: 3456,
			height: 2304,
			exifDate: '2026:09:13 11:04:42'
		},
		{
			name: 'DSC05621.jpg',
			width: 2304,
			height: 3456,
			exifDate: '2026:09:13 11:20:11'
		},
		{
			name: 'DSC05624.jpg',
			width: 3207,
			height: 2138,
			exifDate: '2026:09:13 12:14:58'
		}
	],
	carousels: [
		{
			slideCount: 4,
			backgrounds: [
				{
					photo: 'DSC05400.jpg',
					x0: 0,
					x1: 1080,
					crop: {
						fx: 0.55,
						fy: 0.5,
						zoom: 1.073
					}
				},
				{
					photo: 'DSC05394.jpg',
					x0: 1080,
					x1: 3196,
					crop: {
						fx: 0,
						fy: 0.498,
						zoom: 1.02
					}
				},
				{
					photo: 'DSC05432-Edit.jpg',
					x0: 3196,
					x1: 4320,
					crop: {
						fx: 0.64,
						fy: 0.502,
						zoom: 1.003
					}
				}
			],
			frames: [
				{
					photo: 'DSC05336.jpg',
					x: 1263,
					y: 648,
					h: 570,
					border: 22,
					aspect: 1.274,
					crop: {
						fx: 0.5,
						fy: 0.5,
						zoom: 1
					}
				},
				{
					photo: 'DSC05605.jpg',
					x: 2723,
					y: 108,
					h: 589,
					border: 23,
					aspect: 1.499,
					crop: {
						fx: 0.64,
						fy: 0.5,
						zoom: 1
					}
				}
			]
		},
		{
			slideCount: 6,
			backgrounds: [
				{
					photo: 'DSC05557-Enhanced-NR.jpg',
					x0: 0,
					x1: 1082,
					crop: {
						fx: 0.5,
						fy: 0.502,
						zoom: 1
					}
				},
				{
					photo: 'DSC05327.jpg',
					x0: 1082,
					x1: 2560,
					crop: {
						fx: 0.453,
						fy: 0,
						zoom: 1.003
					}
				},
				{
					photo: 'DSC05350.jpg',
					x0: 2560,
					x1: 4642,
					crop: {
						fx: 0.04,
						fy: 0.502,
						zoom: 1.015
					}
				},
				{
					photo: 'DSC05511.jpg',
					x0: 4642,
					x1: 6480,
					crop: {
						fx: 0.64,
						fy: 0,
						zoom: 1.005
					}
				}
			],
			frames: [
				{
					photo: 'DSC05337.jpg',
					x: 2260,
					y: 100,
					h: 1150,
					border: 35,
					aspect: 0.75,
					crop: {
						fx: 0.5,
						fy: 0.5,
						zoom: 1
					}
				},
				{
					photo: 'DSC05621.jpg',
					x: 4482,
					y: 122,
					h: 1106,
					border: 29,
					aspect: 0.666,
					crop: {
						fx: 0.64,
						fy: 0.5,
						zoom: 1
					}
				}
			]
		},
		{
			slideCount: 5,
			backgrounds: [
				{
					photo: 'DSC05487.jpg',
					x0: 0,
					x1: 1080,
					crop: {
						fx: 0.5,
						fy: 0.502,
						zoom: 1
					}
				},
				{
					photo: 'DSC05624.jpg',
					x0: 1080,
					x1: 2377,
					crop: {
						fx: 0.04,
						fy: 0,
						zoom: 1.028
					}
				},
				{
					photo: 'DSC05345.jpg',
					x0: 2377,
					x1: 3574,
					crop: {
						fx: 0,
						fy: 0.502,
						zoom: 1.028
					}
				},
				{
					photo: 'DSC05469.jpg',
					x0: 3574,
					x1: 5400,
					crop: {
						fx: 0.438,
						fy: 0.5,
						zoom: 1
					}
				}
			],
			frames: [
				{
					photo: 'DSC05441.jpg',
					x: 1200,
					y: 126,
					h: 1098,
					border: 33,
					aspect: 0.75,
					crop: {
						fx: 0.5,
						fy: 0.5,
						zoom: 1
					}
				},
				{
					photo: 'DSC05563-Enhanced-NR.jpg',
					x: 3334,
					y: 126,
					h: 1098,
					border: 35,
					aspect: 0.8,
					crop: {
						fx: 0.64,
						fy: 0,
						zoom: 1.003
					}
				}
			]
		}
	]
};
