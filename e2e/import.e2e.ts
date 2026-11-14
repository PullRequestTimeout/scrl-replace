import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// Uses the private example gallery when it's present locally (it's git-ignored).
const GALLERY = resolve('example-gallery');
const files = existsSync(GALLERY)
	? readdirSync(GALLERY)
			.filter((f) => /\.jpe?g$/i.test(f))
			.sort()
			.map((f) => join(GALLERY, f))
	: [];

test.use({ viewport: { width: 393, height: 852 } });
test.skip(files.length === 0, 'example-gallery/ not present');

test('imports the whole gallery, reads capture dates and keeps photos after reload', async ({
	page
}) => {
	test.setTimeout(120_000);
	await page.goto('/');
	await page.getByRole('button', { name: 'New project' }).first().click();
	await expect(page).toHaveURL(/\/p\/[^/]+\/import$/);

	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add photos' }).click();
	await (await chooser).setFiles(files);

	const count = `${files.length} photos`;
	await expect(page.getByRole('heading', { name: count })).toBeVisible({ timeout: 90_000 });
	await expect(page.getByText(/^Importing/)).toBeHidden();
	await expect(page.locator('main li img')).toHaveCount(files.length);

	// Every gallery photo has EXIF, so the "no capture date" note must not appear.
	await expect(page.getByText(/no capture date/)).toHaveCount(0);

	// The one small landscape photo is flagged as too low-res for a split row.
	await expect(page.getByText('Low res')).toHaveCount(1);

	// Detail sheet shows size and capture time.
	await page.locator('main li button').first().click();
	await expect(page.getByRole('dialog')).toContainText(/MP\s*·\s*\w{3} \d{1,2}, \d{4}/);
	await page.getByRole('button', { name: 'Close' }).click();

	await page.reload();
	await expect(page.getByRole('heading', { name: count })).toBeVisible();
	await expect(page.locator('main li img')).toHaveCount(files.length);

	// Remove one photo.
	await page.locator('main li button').first().click();
	await page.getByRole('button', { name: 'Remove from project' }).click();
	await expect(page.getByRole('heading', { name: `${files.length - 1} photos` })).toBeVisible();
});
