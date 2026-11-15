import type { ColorSpace } from '#lib/model/constants.ts';

/**
 * Per-device preferences. Small and non-critical, so localStorage is fine; every access is
 * guarded because storage can be blocked or cleared.
 */
const COLOR_SPACE_KEY = 'pref:color-space';

export function getColorSpace(): ColorSpace {
	try {
		return localStorage.getItem(COLOR_SPACE_KEY) === 'display-p3' ? 'display-p3' : 'srgb';
	} catch {
		return 'srgb';
	}
}

export function setColorSpace(value: ColorSpace) {
	try {
		localStorage.setItem(COLOR_SPACE_KEY, value);
	} catch {
		// Blocked storage: the choice just won't persist.
	}
}

const DEFAULT_PRESET_KEY = 'pref:default-preset';

/** The style new projects start with. */
export function getDefaultPresetId(): string {
	try {
		return localStorage.getItem(DEFAULT_PRESET_KEY) ?? 'default';
	} catch {
		return 'default';
	}
}

export function setDefaultPresetId(id: string) {
	try {
		localStorage.setItem(DEFAULT_PRESET_KEY, id);
	} catch {
		// Blocked storage: new projects use the built-in style.
	}
}
