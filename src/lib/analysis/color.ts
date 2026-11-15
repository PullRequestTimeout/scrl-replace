import type { Lab } from './types.ts';

const toLinear = (c: number) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const LINEAR = Array.from({ length: 256 }, (_, i) => toLinear(i));

const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);

/** sRGB (0..255) to CIE Lab (D65). */
export function rgbToLab(r: number, g: number, b: number): Lab {
	const R = LINEAR[r];
	const G = LINEAR[g];
	const B = LINEAR[b];
	const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
	const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
	const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
	const fx = f(x);
	const fy = f(y);
	const fz = f(z);
	return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labDistance(p: Lab, q: Lab): number {
	return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}
