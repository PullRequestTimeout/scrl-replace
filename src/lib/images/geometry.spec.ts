import { describe, expect, it } from 'vitest';
import { canBeSplitRow, downscaleSteps, fitWithin, orientationOf } from './geometry.ts';

describe('fitWithin', () => {
	it('scales the long edge down to the limit', () => {
		expect(fitWithin({ width: 6000, height: 4000 }, 3200)).toEqual({ width: 3200, height: 2133 });
		expect(fitWithin({ width: 4672, height: 7008 }, 3200)).toEqual({ width: 2133, height: 3200 });
	});

	it('never upscales', () => {
		expect(fitWithin({ width: 1873, height: 1406 }, 3200)).toEqual({ width: 1873, height: 1406 });
	});
});

describe('downscaleSteps', () => {
	it('halves until within 2x of the target, then lands on the target', () => {
		const steps = downscaleSteps({ width: 8000, height: 5000 }, { width: 256, height: 160 });
		expect(steps.at(-1)).toEqual({ width: 256, height: 160 });
		expect(steps[0]).toEqual({ width: 4000, height: 2500 });
		for (let i = 1; i < steps.length; i++) {
			expect(steps[i].width).toBeLessThan(steps[i - 1].width);
		}
		// The last intermediate step is less than 4x the target.
		expect(steps.at(-2)!.width).toBeLessThan(256 * 4);
	});

	it('is a single draw when the source is already close to the target', () => {
		expect(downscaleSteps({ width: 4000, height: 3000 }, { width: 3200, height: 2400 })).toEqual([
			{ width: 3200, height: 2400 }
		]);
	});
});

describe('orientationOf', () => {
	it('classifies with a tolerance for near-square crops', () => {
		expect(orientationOf({ width: 4412, height: 4412 })).toBe('square');
		expect(orientationOf({ width: 6389, height: 3572 })).toBe('landscape');
		expect(orientationOf({ width: 4672, height: 5850 })).toBe('portrait');
	});
});

describe('canBeSplitRow', () => {
	it('needs at least the split source width', () => {
		expect(canBeSplitRow({ width: 6389, height: 3572 })).toBe(true);
		expect(canBeSplitRow({ width: 1873, height: 1406 })).toBe(false);
	});
});
