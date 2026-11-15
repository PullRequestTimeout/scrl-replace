import {
	DEFAULT_PRESET,
	DEFAULT_PRESET_ID,
	normalizePreset,
	type StylePreset
} from '#lib/model/presets.ts';
import { db, newId } from './db.ts';

/**
 * Style presets. The built-in default always exists and is never stored, so it can't be
 * edited; your own presets start as copies.
 */
export async function listPresets(): Promise<StylePreset[]> {
	const stored = await (await db()).getAll('presets');
	const own = stored.map(normalizePreset).sort((a, b) => a.name.localeCompare(b.name));
	return [structuredClone(DEFAULT_PRESET), ...own];
}

/** The preset with this id, or the default if it's missing (e.g. deleted). */
export async function getPreset(id: string | undefined): Promise<StylePreset> {
	if (!id || id === DEFAULT_PRESET_ID) return structuredClone(DEFAULT_PRESET);
	const stored = await (await db()).get('presets', id);
	return stored ? normalizePreset(stored) : structuredClone(DEFAULT_PRESET);
}

export const isBuiltIn = (id: string) => id === DEFAULT_PRESET_ID;

export async function savePreset(preset: StylePreset): Promise<StylePreset> {
	if (isBuiltIn(preset.id)) throw new Error('The built-in style can’t be changed');
	const clean = normalizePreset(JSON.parse(JSON.stringify(preset)) as StylePreset);
	await (await db()).put('presets', clean);
	return clean;
}

export async function duplicatePreset(id: string): Promise<StylePreset> {
	const source = await getPreset(id);
	const names = new Set((await listPresets()).map((p) => p.name));
	let name = `${source.name} (copy)`;
	for (let n = 2; names.has(name); n++) name = `${source.name} (copy ${n})`;
	return savePreset({ ...source, id: newId(), name });
}

/** Projects using a deleted preset fall back to the default when they next suggest. */
export async function deletePreset(id: string): Promise<void> {
	if (isBuiltIn(id)) return;
	await (await db()).delete('presets', id);
}
