// Writes ~256px RGBA copies of the private galleries for unit tests (git-ignored output).
// sharp is not a project dependency: run
//   npm i --no-save sharp && node scripts/make-fixtures.mjs
import sharp from 'sharp';
import { mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import exifr from 'exifr/dist/lite.esm.mjs';
import { existsSync } from 'node:fs';
const ROOT = process.cwd();
for (const set of ['og-gallery', 'example-gallery'].filter((s) => existsSync(`${ROOT}/${s}`))) {
	const out = `${ROOT}/fixtures/generated/${set}`;
	mkdirSync(out, { recursive: true });
	const index = [];
	for (const name of readdirSync(`${ROOT}/${set}`)
		.filter((f) => /\.jpe?g$/i.test(f))
		.sort()) {
		const path = `${ROOT}/${set}/${name}`;
		const meta = await sharp(path).metadata();
		const swap = (meta.orientation ?? 1) >= 5;
		const { data, info } = await sharp(path)
			.rotate()
			.resize(256, 256, { fit: 'inside' })
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		writeFileSync(`${out}/${name}.rgba`, data);
		const t = await exifr
			.parse(readFileSync(path).subarray(0, 262144), {
				ifd1: false,
				gps: false,
				interop: false,
				exif: true,
				xmp: false,
				iptc: false,
				icc: false,
				jfif: false,
				ihdr: false,
				reviveValues: false
			})
			.catch(() => null);
		index.push({
			name,
			width: info.width,
			height: info.height,
			origWidth: swap ? meta.height : meta.width,
			origHeight: swap ? meta.width : meta.height,
			exifDate: t?.DateTimeOriginal ?? null
		});
	}
	writeFileSync(`${out}/index.json`, JSON.stringify(index, null, 1));
	console.log(set, index.length);
}
