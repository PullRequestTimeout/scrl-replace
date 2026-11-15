import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// Touch-driven editor flows (iPhone-like): picker reopening, and zooming in from the overview.
const GALLERY = resolve('example-gallery');
const files = existsSync(GALLERY)
	? readdirSync(GALLERY)
			.filter((f) => /\.jpe?g$/i.test(f))
			.sort()
			.slice(0, 4)
			.map((f) => join(GALLERY, f))
	: [];

test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
test.skip(files.length === 0, 'example-gallery/ not present');

test('empty slots: tap opens the picker, Choose reopens it, overview tap zooms to that slide', async ({
	page
}) => {
	test.setTimeout(120_000);
	await page.goto('/');
	await page.getByRole('button', { name: 'New project' }).first().tap();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add photos' }).tap();
	await (await chooser).setFiles(files);
	await expect(page.getByRole('heading', { name: `${files.length} photos` })).toBeVisible({
		timeout: 60_000
	});
	await page.getByRole('link', { name: 'Done' }).tap();
	await page.getByRole('button', { name: 'Build by hand' }).tap();
	await page.getByLabel(/^Carousel 1/).tap();

	const surface = page.getByRole('application');
	const dialog = page.getByRole('dialog');

	// The view opens on slide 1 with a margin before the strip.
	const box = (await surface.boundingBox())!;
	await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height / 2);
	await expect(page.getByRole('heading', { name: 'Choose the grid tile photo' })).toBeVisible();
	await dialog.getByRole('button').first().tap();
	await expect(dialog).toBeHidden();
	await page.getByRole('button', { name: 'Deselect' }).tap();

	// Overview: tap the last slide, which should zoom in centred on it.
	await page.getByRole('button', { name: 'Add slide' }).tap();
	await page.getByRole('button', { name: 'Whole strip' }).tap();
	const overview = (await surface.boundingBox())!;
	await page.touchscreen.tap(overview.x + overview.width - 30, overview.y + overview.height / 2);
	await expect(page.getByRole('button', { name: 'Slide', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	// Centre of the view is now on the (empty) last slide: tapping opens the picker.
	const zoomed = (await surface.boundingBox())!;
	await page.touchscreen.tap(zoomed.x + zoomed.width / 2, zoomed.y + zoomed.height / 2);
	await expect(page.getByRole('heading', { name: 'Choose a photo' })).toBeVisible();

	// Dismiss by tapping the overlay; "Choose" must reopen it.
	await page.touchscreen.tap(200, 40);
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Empty background')).toBeVisible();
	await page.getByRole('button', { name: 'Choose' }).tap();
	await expect(page.getByRole('heading', { name: 'Choose a photo' })).toBeVisible();
	await dialog.getByRole('button').nth(1).tap();
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Empty background')).toBeHidden();
});
