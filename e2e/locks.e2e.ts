import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Carousel locks and split-row first slides, on the private example gallery (git-ignored).
const GALLERY = resolve('example-gallery');
const files = existsSync(GALLERY)
	? readdirSync(GALLERY)
			.filter((f) => /\.jpe?g$/i.test(f))
			.sort()
			.map((f) => join(GALLERY, f))
	: [];

test.use({ viewport: { width: 393, height: 852 } });
test.skip(files.length === 0, 'example-gallery/ not present');

interface Saved {
	row: { mode: string; photoId?: string };
	locked?: boolean[];
	carousels: { backgrounds: { photoId: string; crop: { fx: number } }[] }[];
}

function readProject(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((res) => {
			const r = indexedDB.open('strip');
			r.onsuccess = () => res(r.result);
		});
		const projects = await new Promise<unknown[]>((res) => {
			const q = db.transaction('projects').objectStore('projects').getAll();
			q.onsuccess = () => res(q.result);
		});
		db.close();
		return projects[0];
	}) as Promise<Saved>;
}

/** Tap slide 1 of the strip (the editor opens zoomed on it). */
async function tapSlideOne(page: Page) {
	const box = (await page.getByRole('application').boundingBox())!;
	await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
}

test('locks carousels, and keeps a split row’s first slides lined up', async ({ page }) => {
	test.setTimeout(240_000);
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
	await page.getByRole('radio', { name: 'Split' }).click();
	const noSplit = page.getByText('No photo is wide and large enough');
	await expect(page.getByText(/^1 of \d/).or(noSplit)).toBeVisible({ timeout: 30_000 });
	test.skip(await noSplit.isVisible(), 'no photo in the gallery makes a split row');
	await page.getByRole('button', { name: 'Use this row' }).click();
	await expect(page.getByLabel(/^Carousel 1/)).toBeVisible({ timeout: 60_000 });
	expect((await readProject(page)).row.mode).toBe('split');

	// Lock carousel 1: it becomes view-only, and the lock survives a reload.
	await page.getByLabel(/^Carousel 1/).click();
	const lock = page.getByRole('switch', { name: 'Lock this carousel' });
	await expect(lock).not.toBeChecked();
	await lock.click();
	await expect(lock).toBeChecked();
	await expect(page.getByText(/so it can’t be edited/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeHidden();
	await expect(page.getByRole('link', { name: 'Other layouts' })).toBeHidden();
	await page.reload();
	await expect(page.getByRole('switch', { name: 'Lock this carousel' })).toBeChecked();
	expect((await readProject(page)).locked).toEqual([true, false, false]);

	// Project page and Move photos show it; nothing moves into or out of it.
	await page.getByRole('link', { name: 'Project' }).click();
	await expect(page.getByLabel(/^Carousel 1, .*, locked$/)).toBeVisible();
	await page.getByRole('link', { name: 'Move photos' }).click();
	await expect(page.getByRole('img', { name: /, locked$/ }).first()).toBeVisible();
	await page
		.getByRole('button', { name: /^Photo \d+$/ })
		.first()
		.click();
	await expect(page.getByRole('menuitem', { name: /Move to/ }).first()).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Move to left' })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// A new row would rebuild the locked carousel, so it's turned off.
	await page.getByRole('link', { name: 'Project' }).click();
	await page.getByRole('link', { name: 'New suggestions' }).click();
	await expect(page.getByText('Unlock them first')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('button', { name: 'Use this row' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);

	// Carousel 2's first slide is frozen while carousel 1 is locked.
	await page.goto(page.url().replace(/\/row$/, '/c/2'));
	await tapSlideOne(page);
	await expect(page.getByText(/carousel 1 is locked/)).toBeVisible();
	const replace = page.getByRole('button', { name: 'Replace' });
	await expect(replace).toHaveAttribute('aria-disabled', 'true');
	await expect(replace).toHaveAccessibleDescription(/carousel 1 is locked/);

	// Unlock carousel 1; now replacing carousel 2's first slide asks, then recuts all three.
	await page.goto(page.url().replace(/\/c\/2$/, '/c/1'));
	await page.getByRole('switch', { name: 'Lock this carousel' }).click();
	await expect.poll(async () => (await readProject(page)).locked).toEqual([false, false, false]);
	await page.goto(page.url().replace(/\/c\/1$/, '/c/2'));
	const before = await readProject(page);

	await tapSlideOne(page);
	await page.getByRole('button', { name: 'Replace' }).click();
	await page
		.getByRole('button', { name: /used in Carousel 1/ })
		.first()
		.click();
	const ask = page.getByRole('alertdialog', { name: 'Change all three first slides?' });
	await expect(ask).toBeVisible();
	// Turning it down leaves everything as it was.
	await ask.getByRole('button', { name: 'Undo change' }).click();
	await expect(ask).toBeHidden();
	await page.waitForTimeout(800);
	const unchanged = await readProject(page);
	expect(unchanged.carousels.map((c) => c.backgrounds[0])).toEqual(
		before.carousels.map((c) => c.backgrounds[0])
	);

	await tapSlideOne(page);
	await page.getByRole('button', { name: 'Replace' }).click();
	await page
		.getByRole('button', { name: /used in Carousel 1/ })
		.first()
		.click();
	await ask.getByRole('button', { name: 'Change all three' }).click();
	await expect(ask).toBeHidden();
	await expect.poll(async () => (await readProject(page)).row.photoId).not.toBe(before.row.photoId);
	const after = await readProject(page);
	const tiles = after.carousels.map((c) => c.backgrounds[0].photoId);
	expect(new Set(tiles)).toEqual(new Set([after.row.photoId]));

	// Once confirmed, later slide 1 changes recut all three at once, with Undo in a toast.
	await tapSlideOne(page);
	await page.getByRole('button', { name: 'Replace' }).click();
	await page
		.getByRole('button', { name: /used in Carousel 3/ })
		.first()
		.click();
	await expect(ask).toBeHidden();
	await expect(page.getByText('Updated all three first slides')).toBeVisible();
	await expect.poll(async () => (await readProject(page)).row.photoId).not.toBe(after.row.photoId);
	await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
	await expect(page.getByText('All three first slides put back')).toBeVisible();
	await expect.poll(async () => (await readProject(page)).row.photoId).toBe(after.row.photoId);
	const undone = await readProject(page);
	expect(new Set(undone.carousels.map((c) => c.backgrounds[0].photoId))).toEqual(
		new Set([after.row.photoId])
	);
});
