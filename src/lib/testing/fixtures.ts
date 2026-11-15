/**
 * Test-only access to the small RGBA copies of the private galleries in fixtures/generated/
 * (git-ignored; regenerate with `node scripts/make-fixtures.mjs`). Tests that need them
 * skip when they're absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Pixels } from '#lib/analysis/types.ts';

export interface FixturePhoto {
	name: string;
	width: number;
	height: number;
	origWidth: number;
	origHeight: number;
	exifDate: string | null;
}

const ROOT = resolve('fixtures/generated');

export function fixtureSet(set: 'og-gallery' | 'example-gallery'): FixturePhoto[] {
	const index = join(ROOT, set, 'index.json');
	return existsSync(index) ? (JSON.parse(readFileSync(index, 'utf8')) as FixturePhoto[]) : [];
}

export function fixturePixels(set: string, photo: FixturePhoto): Pixels {
	const data = new Uint8Array(readFileSync(join(ROOT, set, `${photo.name}.rgba`)));
	return { data, width: photo.width, height: photo.height };
}

/** Synthetic image from a per-pixel colour function. */
export function synthetic(
	width: number,
	height: number,
	colour: (x: number, y: number) => [number, number, number]
): Pixels {
	const data = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [r, g, b] = colour(x, y);
			const i = (y * width + x) * 4;
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = 255;
		}
	}
	return { data, width, height };
}
