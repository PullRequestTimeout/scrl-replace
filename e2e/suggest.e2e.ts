import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// Suggestion flow on the private example gallery (git-ignored): row options, building the
// carousels from a row, and swapping one carousel's layout. Screenshots go to test-results/.
const GALLERY = resolve('example-gallery');
const files = existsSync(GALLERY)
	? readdirSync(GALLERY)
			.filter((f) => /\.jpe?g$/i.test(f))
			.sort()
			.map((f) => join(GALLERY, f))
	: [];

test.use({ viewport: { width: 393, height: 852 } });
test.skip(files.length === 0, 'example-gallery/ not present');

test('suggests a grid row, builds three carousels, and offers other layouts', async ({ page }) => {
	test.setTimeout(180_000);
	await page.goto('/');
	await page.getByRole('button', { name: 'New project' }).first().click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add photos' }).click();
	await (await chooser).setFiles(files);
	await expect(page.getByRole('heading', { name: `${files.length} photos` })).toBeVisible({
		timeout: 120_000
	});
	await page.getByRole('link', { name: 'Done' }).click();

	await page.getByRole('link', { name: 'Suggest layouts' }).click();
	await expect(page.getByLabel('Row options')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText(/^1 of \d/)).toBeVisible();
	await page.waitForTimeout(400);
	await page.screenshot({ path: 'test-results/suggest-row.png' });

	// Matched-only filter still gives options.
	await page.getByRole('radio', { name: 'Matched' }).click();
	await expect(page.getByText('Three matched photos').first()).toBeVisible();
	await page.getByRole('radio', { name: 'Any' }).click();
	await expect(page.getByText(/^1 of \d/)).toBeVisible();

	await page.getByRole('button', { name: 'Use this row' }).click();
	await expect(page.getByLabel(/^Carousel 1/)).toBeVisible({ timeout: 60_000 });
	await expect(page.getByLabel(/^Carousel \d/)).toHaveCount(3);
	await page.waitForTimeout(600);
	await page.screenshot({ path: 'test-results/suggest-hub.png', fullPage: true });

	// Every photo is used exactly once across the three carousels (plus the row).
	const usage = await page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((res) => {
			const r = indexedDB.open('strip');
			r.onsuccess = () => res(r.result);
		});
		const projects = await new Promise<
			{
				photoIds: string[];
				carousels: { backgrounds: { photoId: string }[]; frames: { photoId: string }[] }[];
				row: { mode: string };
			}[]
		>((res) => {
			const q = db.transaction('projects').objectStore('projects').getAll();
			q.onsuccess = () => res(q.result);
		});
		db.close();
		const p = projects[0];
		const used = p.carousels.flatMap((c) => [
			...c.backgrounds.slice(1).map((b) => b.photoId),
			...c.frames.map((f) => f.photoId)
		]);
		const tiles = p.carousels.map((c) => c.backgrounds[0].photoId);
		return { total: p.photoIds.length, used, tiles, mode: p.row.mode };
	});
	const all = new Set([...usage.used, ...usage.tiles]);
	expect(new Set(usage.used).size).toBe(usage.used.length);
	expect(all.size).toBe(usage.total);

	// Move one photo from the left carousel to the middle; only those two rebuild.
	const readProject = () =>
		page.evaluate(async () => {
			const db = await new Promise<IDBDatabase>((res) => {
				const r = indexedDB.open('strip');
				r.onsuccess = () => res(r.result);
			});
			const projects = await new Promise<
				{
					assignment: string[][];
					carousels: { backgrounds: { photoId: string }[]; frames: { photoId: string }[] }[];
				}[]
			>((res) => {
				const q = db.transaction('projects').objectStore('projects').getAll();
				q.onsuccess = () => res(q.result);
			});
			db.close();
			return projects[0];
		});
	const before = await readProject();
	const movedId = before.assignment[0][0];
	await page.getByRole('link', { name: 'Move photos' }).click();
	const left = page.getByRole('region', { name: 'Left carousel' });
	await left.getByRole('button').first().click();
	await page.getByRole('menuitem', { name: 'Move to middle' }).click();
	await expect(page.getByText('Will rebuild')).toHaveCount(2);
	await page.screenshot({ path: 'test-results/suggest-move.png', fullPage: true });
	await page.getByRole('button', { name: 'Rebuild 2 carousels' }).click();
	await page.getByRole('button', { name: 'Rebuild', exact: true }).click();
	await expect(page.getByLabel(/^Carousel 1/)).toBeVisible({ timeout: 60_000 });
	const after = await readProject();
	expect(after.assignment[1]).toContain(movedId);
	expect(after.assignment[0]).not.toContain(movedId);
	const inMiddle = [
		...after.carousels[1].backgrounds.map((b) => b.photoId),
		...after.carousels[1].frames.map((f) => f.photoId)
	];
	expect(inMiddle).toContain(movedId);
	expect(after.carousels[2]).toEqual(before.carousels[2]);

	// Other layouts for carousel 1.
	await page.getByLabel(/^Carousel 1/).click();
	await page.getByRole('link', { name: 'Other layouts' }).click();
	await expect(page.getByRole('button', { name: /^Layout 1,/ })).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(400);
	await page.screenshot({ path: 'test-results/suggest-layouts.png', fullPage: true });
	await page.getByRole('button', { name: /^Layout 2,/ }).click();
	await page.getByRole('button', { name: 'Use layout' }).click();
	await expect(page.getByRole('application')).toBeVisible();
});
