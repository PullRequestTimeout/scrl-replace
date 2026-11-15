import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET, normalizePreset } from './presets.ts';

describe('normalizePreset', () => {
	it('fills missing settings and weights from the default', () => {
		const p = normalizePreset({ id: 'x', name: 'Mine', weights: { contrast: 4 } as never });
		expect(p.id).toBe('x');
		expect(p.name).toBe('Mine');
		expect(p.weights.contrast).toBe(4);
		expect(p.weights.backgroundHidden).toBe(DEFAULT_PRESET.weights.backgroundHidden);
		expect(p.frameHeight).toEqual(DEFAULT_PRESET.frameHeight);
	});

	it('clamps numbers and keeps ranges in order', () => {
		const p = normalizePreset({
			id: 'x',
			frameHeight: [0.95, 0.1],
			joinClearance: 9999,
			weights: { rhythm: -3 } as never
		});
		expect(p.frameHeight).toEqual([0.2, 0.95]);
		expect(p.joinClearance).toBe(300);
		expect(p.weights.rhythm).toBe(0);
	});

	it('leaves the default unchanged', () => {
		expect(normalizePreset(DEFAULT_PRESET)).toEqual(DEFAULT_PRESET);
	});
});
