import { describe, expect, it } from 'vitest';
import {
	isSlowRun,
	median,
	recordRun,
	SLOW_FLOOR_MS,
	SLOW_LOAD_MS,
	slowThreshold
} from './watchdog.ts';

describe('slowThreshold', () => {
	it('never drops below the floor, even on a fast device', () => {
		expect(slowThreshold(17)).toBe(SLOW_FLOOR_MS);
	});

	it('scales with the speed measured when it was turned on', () => {
		expect(slowThreshold(800)).toBe(2600);
	});

	it('assumes a middling device when there was no speed test', () => {
		expect(slowThreshold(null)).toBe(SLOW_FLOOR_MS);
	});
});

describe('isSlowRun', () => {
	it('flags runs far slower than the speed test, or a very slow model load', () => {
		expect(isSlowRun({ perPhotoMs: 300, loadMs: 0 }, 17)).toBe(false);
		expect(isSlowRun({ perPhotoMs: 2000, loadMs: 0 }, 17)).toBe(true);
		expect(isSlowRun({ perPhotoMs: 300, loadMs: SLOW_LOAD_MS + 1 }, 17)).toBe(true);
	});
});

describe('recordRun', () => {
	it('ignores a one-off slow run', () => {
		expect(recordRun([false, false], true).warn).toBe(false);
	});

	it('asks once two of the last three runs were slow', () => {
		expect(recordRun([true, false], true).warn).toBe(true);
	});

	it('forgets runs older than the last three', () => {
		const { history, warn } = recordRun([true, false, false], false);
		expect(history).toEqual([false, false, false]);
		expect(warn).toBe(false);
	});
});

describe('median', () => {
	it('handles empty and odd/even lists', () => {
		expect(median([])).toBe(0);
		expect(median([5, 1, 3])).toBe(3);
		expect(median([4, 1, 3, 2])).toBe(3);
	});
});
