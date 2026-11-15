/**
 * Photo analysis on a small (~256px) RGBA copy. Pure functions, so they run in the worker and
 * in unit tests alike. Everything here is cheap image statistics: no AI models.
 */
import { labDistance, rgbToLab } from './color.ts';
import {
	ANALYSIS_VERSION,
	type Lab,
	type PhotoAnalysis,
	type Pixels,
	type SaliencyMap
} from './types.ts';

/** Long side of the saliency grid. */
export const SAL_GRID = 32;

interface LabImage {
	w: number;
	h: number;
	L: Float32Array;
	A: Float32Array;
	B: Float32Array;
}

function toLabImage({ data, width, height }: Pixels): LabImage {
	const n = width * height;
	const L = new Float32Array(n);
	const A = new Float32Array(n);
	const B = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const lab = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
		L[i] = lab.l;
		A[i] = lab.a;
		B[i] = lab.b;
	}
	return { w: width, h: height, L, A, B };
}

const mean = (xs: ArrayLike<number>) => {
	let s = 0;
	for (let i = 0; i < xs.length; i++) s += xs[i];
	return xs.length ? s / xs.length : 0;
};

const std = (xs: ArrayLike<number>, m = mean(xs)) => {
	let s = 0;
	for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
	return xs.length ? Math.sqrt(s / xs.length) : 0;
};

// ---------------------------------------------------------------------------
// Tone and colour

function chromaStats(img: LabImage) {
	const n = img.L.length;
	const c = new Float32Array(n);
	for (let i = 0; i < n; i++) c[i] = Math.hypot(img.A[i], img.B[i]);
	const sorted = Float32Array.from(c).sort();
	return { mean: mean(c), p95: sorted[Math.floor(n * 0.95)] ?? 0 };
}

/** Black and white, allowing for a slight tint (toned or split-toned B&W). */
export function detectMono(meanChroma: number, p95Chroma: number): boolean {
	return meanChroma < 5 && p95Chroma < 12;
}

/** k-means (k=3) in Lab on a pixel sample. Deterministic initialisation by lightness quantiles. */
function dominantColours(img: LabImage, k = 3): { lab: Lab; weight: number }[] {
	const step = Math.max(1, Math.floor(Math.sqrt(img.L.length / 4000)));
	const pts: Lab[] = [];
	for (let y = 0; y < img.h; y += step) {
		for (let x = 0; x < img.w; x += step) {
			const i = y * img.w + x;
			pts.push({ l: img.L[i], a: img.A[i], b: img.B[i] });
		}
	}
	if (!pts.length) return [];
	const byL = [...pts].sort((p, q) => p.l - q.l);
	let centres = Array.from({ length: k }, (_, j) => ({
		...byL[Math.floor(((j + 0.5) / k) * byL.length)]
	}));
	const assign = new Int32Array(pts.length);
	for (let iter = 0; iter < 10; iter++) {
		for (let p = 0; p < pts.length; p++) {
			let best = 0;
			let bestD = Infinity;
			for (let j = 0; j < k; j++) {
				const d = labDistance(pts[p], centres[j]);
				if (d < bestD) {
					bestD = d;
					best = j;
				}
			}
			assign[p] = best;
		}
		centres = centres.map((c, j) => {
			let l = 0;
			let a = 0;
			let b = 0;
			let n = 0;
			for (let p = 0; p < pts.length; p++) {
				if (assign[p] !== j) continue;
				l += pts[p].l;
				a += pts[p].a;
				b += pts[p].b;
				n++;
			}
			return n ? { l: l / n, a: a / n, b: b / n } : c;
		});
	}
	const counts = new Array(k).fill(0);
	for (let p = 0; p < pts.length; p++) counts[assign[p]]++;
	return centres
		.map((lab, j) => ({ lab, weight: counts[j] / pts.length }))
		.sort((p, q) => q.weight - p.weight);
}

// ---------------------------------------------------------------------------
// Saliency: centre–surround contrast in Lab plus edge strength, with a mild centre prior.

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
	if (r < 1) return Float32Array.from(src);
	const tmp = new Float32Array(w * h);
	const out = new Float32Array(w * h);
	for (let y = 0; y < h; y++) {
		let acc = 0;
		for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
		for (let x = 0; x < w; x++) {
			tmp[y * w + x] = acc / (2 * r + 1);
			const add = Math.min(w - 1, x + r + 1);
			const sub = Math.max(0, x - r);
			acc += src[y * w + add] - src[y * w + sub];
		}
	}
	for (let x = 0; x < w; x++) {
		let acc = 0;
		for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
		for (let y = 0; y < h; y++) {
			out[y * w + x] = acc / (2 * r + 1);
			const add = Math.min(h - 1, y + r + 1);
			const sub = Math.max(0, y - r);
			acc += tmp[add * w + x] - tmp[sub * w + x];
		}
	}
	return out;
}

/** Resample a channel to a smaller grid by area averaging. */
function downsample(src: Float32Array, w: number, h: number, gw: number, gh: number): Float32Array {
	const out = new Float32Array(gw * gh);
	const cnt = new Float32Array(gw * gh);
	for (let y = 0; y < h; y++) {
		const gy = Math.min(gh - 1, Math.floor((y * gh) / h));
		for (let x = 0; x < w; x++) {
			const gx = Math.min(gw - 1, Math.floor((x * gw) / w));
			out[gy * gw + gx] += src[y * w + x];
			cnt[gy * gw + gx]++;
		}
	}
	for (let i = 0; i < out.length; i++) out[i] /= cnt[i] || 1;
	return out;
}

export function saliencyMap(img: LabImage): SaliencyMap {
	// Work on a 64px-long-side grid, then reduce to SAL_GRID.
	const scale = 64 / Math.max(img.w, img.h);
	const w = Math.max(4, Math.round(img.w * scale));
	const h = Math.max(4, Math.round(img.h * scale));
	const L = downsample(img.L, img.w, img.h, w, h);
	const A = downsample(img.A, img.w, img.h, w, h);
	const B = downsample(img.B, img.w, img.h, w, h);

	const sal = new Float32Array(w * h);
	// Centre–surround at two scales: how different each spot is from its neighbourhood.
	for (const r of [3, 8]) {
		const Ls = boxBlur(L, w, h, r);
		const As = boxBlur(A, w, h, r);
		const Bs = boxBlur(B, w, h, r);
		const Lc = boxBlur(L, w, h, 1);
		const Ac = boxBlur(A, w, h, 1);
		const Bc = boxBlur(B, w, h, 1);
		for (let i = 0; i < sal.length; i++) {
			sal[i] += Math.hypot(Lc[i] - Ls[i], 1.5 * (Ac[i] - As[i]), 1.5 * (Bc[i] - Bs[i]));
		}
	}
	// Edge strength (texture/detail).
	for (let y = 1; y < h - 1; y++) {
		for (let x = 1; x < w - 1; x++) {
			const i = y * w + x;
			const gx = L[i + 1] - L[i - 1];
			const gy = L[i + w] - L[i - w];
			sal[i] += 0.35 * Math.hypot(gx, gy);
		}
	}
	// Mild centre prior: subjects tend away from the very edges.
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const dx = (x + 0.5) / w - 0.5;
			const dy = (y + 0.5) / h - 0.5;
			sal[y * w + x] *= 0.65 + 0.35 * Math.exp(-(dx * dx + dy * dy) / 0.18);
		}
	}
	const smooth = boxBlur(sal, w, h, 1);
	const gw = img.w >= img.h ? SAL_GRID : Math.max(4, Math.round((SAL_GRID * img.w) / img.h));
	const gh = img.h > img.w ? SAL_GRID : Math.max(4, Math.round((SAL_GRID * img.h) / img.w));
	const grid = downsample(smooth, w, h, gw, gh);
	let max = 0;
	for (const v of grid) max = Math.max(max, v);
	return { w: gw, h: gh, values: Array.from(grid, (v) => (max ? Math.round((v / max) * 255) : 0)) };
}

/** Centre of mass and bounding box of the salient region (cells above mean + 0.75 std). */
export function saliencySummary(map: SaliencyMap) {
	const { w, h, values } = map;
	const m = mean(values);
	const threshold = m + 0.75 * std(values, m);
	let sx = 0;
	let sy = 0;
	let s = 0;
	let x0 = w;
	let y0 = h;
	let x1 = -1;
	let y1 = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const v = values[y * w + x];
			if (v < threshold) continue;
			const wt = v - threshold + 1;
			sx += (x + 0.5) * wt;
			sy += (y + 0.5) * wt;
			s += wt;
			x0 = Math.min(x0, x);
			y0 = Math.min(y0, y);
			x1 = Math.max(x1, x);
			y1 = Math.max(y1, y);
		}
	}
	if (!s) return { cx: 0.5, cy: 0.5, box: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } };
	return {
		cx: sx / s / w,
		cy: sy / s / h,
		box: { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h }
	};
}

// ---------------------------------------------------------------------------
// Horizon: a row with a strong, consistent vertical lightness change across the width.

export function detectHorizon(img: LabImage): number | null {
	const scale = 128 / Math.max(img.w, img.h);
	const w = Math.max(8, Math.round(img.w * scale));
	const h = Math.max(8, Math.round(img.h * scale));
	const L = boxBlur(downsample(img.L, img.w, img.h, w, h), w, h, 1);
	const rowScore = new Float32Array(h);
	for (let y = 2; y < h - 2; y++) {
		let s = 0;
		let positive = 0;
		for (let x = 0; x < w; x++) {
			const d = L[(y + 2) * w + x] - L[(y - 2) * w + x];
			s += Math.abs(d);
			if (d < 0) positive++; // brighter above (sky) than below
		}
		// Consistency: most columns should change the same way.
		const consistency = Math.abs(positive / w - 0.5) * 2;
		rowScore[y] = (s / w) * consistency;
	}
	let best = -1;
	let bestScore = 0;
	for (let y = 0; y < h; y++) if (rowScore[y] > bestScore) [best, bestScore] = [y, rowScore[y]];
	const sorted = Float32Array.from(rowScore).sort();
	const median = sorted[Math.floor(h / 2)] || 1e-6;
	// Must stand out clearly and sit in the middle band of the frame.
	if (best < 0 || bestScore < 6 || bestScore < median * 4) return null;
	const y = (best + 0.5) / h;
	return y > 0.15 && y < 0.85 ? y : null;
}

// ---------------------------------------------------------------------------
// Difference hash

export function dhash(img: LabImage): string {
	const g = downsample(img.L, img.w, img.h, 9, 8);
	let hex = '';
	for (let y = 0; y < 8; y++) {
		let byte = 0;
		for (let x = 0; x < 8; x++) byte = (byte << 1) | (g[y * 9 + x] > g[y * 9 + x + 1] ? 1 : 0);
		hex += byte.toString(16).padStart(2, '0');
	}
	return hex;
}

export function hammingDistance(a: string, b: string): number {
	let d = 0;
	for (let i = 0; i < Math.min(a.length, b.length); i += 2) {
		let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
		while (x) {
			d += x & 1;
			x >>= 1;
		}
	}
	return d;
}

export const NEAR_DUPLICATE_BITS = 10;

// ---------------------------------------------------------------------------

/**
 * How concentrated the saliency is: the share of the frame needed to hold half of the
 * above-median saliency. Measured on the reference shots: small subjects in big scenes sit
 * around 0.07–0.09, tight details around 0.12–0.13. A weak signal, used only for rhythm.
 */
export function subjectConcentration(map: SaliencyMap): number {
	const vals = [...map.values].sort((a, b) => b - a);
	const median = vals[Math.floor(vals.length / 2)] ?? 0;
	const pos = vals.map((v) => Math.max(0, v - median));
	const total = pos.reduce((a, b) => a + b, 0);
	if (!total) return 0.1;
	let acc = 0;
	let k = 0;
	while (acc < total * 0.5 && k < pos.length) acc += pos[k++];
	return k / vals.length;
}

export function shotType(concentration: number): PhotoAnalysis['shot'] {
	if (concentration < 0.095) return 'wide';
	if (concentration > 0.118) return 'close';
	return 'medium';
}

export function analyzePixels(pixels: Pixels): PhotoAnalysis {
	const img = toLabImage(pixels);
	const chroma = chromaStats(img);
	const lumaMean = mean(img.L);
	const map = saliencyMap(img);
	const summary = saliencySummary(map);
	return {
		version: ANALYSIS_VERSION,
		isMono: detectMono(chroma.mean, chroma.p95),
		lumaMean: lumaMean / 100,
		lumaStd: std(img.L, lumaMean) / 100,
		chroma: chroma.mean,
		warmth: mean(img.B) + 0.3 * mean(img.A),
		dominant: dominantColours(img),
		saliency: { ...summary, map },
		horizonY: detectHorizon(img),
		shot: shotType(subjectConcentration(map)),
		dhash: dhash(img)
	};
}
