import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const GALLERY = resolve('example-gallery');
const firstPhoto = existsSync(GALLERY)
	? readdirSync(GALLERY)
			.filter((f) => /\.jpe?g$/i.test(f))
			.sort()
			.map((f) => join(GALLERY, f))[0]
	: undefined;

test.use({ viewport: { width: 393, height: 852 } });

test('a marker left by an unfinished import shows a notice on the next launch', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'New project' }).first().click();
	await expect(page).toHaveURL(/\/p\/[^/]+\/import$/);
	const projectId = new URL(page.url()).pathname.split('/')[2];

	// What the importer leaves behind when iOS kills the page mid-import.
	await page.evaluate((id) => {
		localStorage.setItem(
			'import:in-progress',
			JSON.stringify({ projectId: id, done: 4, total: 12, current: 'IMG_0005.JPG' })
		);
	}, projectId);
	await page.goto('/');

	await expect(page.getByText('Your last import didn’t finish')).toBeVisible();
	await expect(
		page.getByText(/stopped on “IMG_0005\.JPG”.*4 of 12 photos were saved/)
	).toBeVisible();
	await page.getByRole('button', { name: 'Add the rest' }).click();
	await expect(page).toHaveURL(`/p/${projectId}/import`);

	// Shown once: the marker is cleared when read.
	await page.reload();
	await expect(page.getByRole('heading', { name: '0 photos' })).toBeVisible();
	await expect(page.getByText('Your last import didn’t finish')).toHaveCount(0);
});

test('a finished import leaves no marker behind', async ({ page }) => {
	test.skip(!firstPhoto, 'example-gallery/ not present');
	await page.goto('/');
	await page.getByRole('button', { name: 'New project' }).first().click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add photos' }).click();
	await (await chooser).setFiles([firstPhoto!]);
	await expect(page.getByRole('heading', { name: '1 photo' })).toBeVisible({ timeout: 30_000 });
	expect(await page.evaluate(() => localStorage.getItem('import:in-progress'))).toBeNull();
});

test('a stuck photo offers a reload, which then reports the interrupted import', async ({
	page
}) => {
	test.skip(!firstPhoto, 'example-gallery/ not present');
	await page.clock.install();
	await page.goto('/');
	await page.getByRole('button', { name: 'New project' }).first().click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add photos' }).click();
	await (await chooser).setFiles([firstPhoto!]);

	// A full-size photo takes about a second to process; jump past the stall limit before then.
	await expect(page.getByText(/^Importing 1 of 1/)).toBeVisible();
	await page.clock.fastForward('00:31');
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toContainText('taking longer than expected');
	await expect(dialog).toContainText('pick the photos again');

	await dialog.getByRole('button', { name: 'Reload app' }).click();
	await expect(page.getByText('Your last import didn’t finish')).toBeVisible();
	await expect(page.getByText(/None of the photos were saved/)).toBeVisible();

	// Infinite toasts must be dismissable without a swipe.
	await page.getByRole('button', { name: 'Dismiss' }).click();
	await expect(page.getByText('Your last import didn’t finish')).toHaveCount(0);
});
