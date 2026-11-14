import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

// Rebuilds the three reference carousels from the private og-gallery (git-ignored) and
// exports them. Exported slides land in test-results/reference-export for comparison
// against the original SCRL exports.
const GALLERY = resolve('og-gallery');
const OUT = resolve('test-results/reference-export');
const files = existsSync(GALLERY)
	? readdirSync(GALLERY)
			.filter((f) => /\.jpe?g$/i.test(f))
			.sort()
			.map((f) => join(GALLERY, f))
	: [];

test.use({ viewport: { width: 393, height: 852 }, acceptDownloads: true });
test.skip(files.length === 0, 'og-gallery/ not present');

test('rebuilds and exports the reference carousels', async ({ page }) => {
	test.setTimeout(180_000);
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Create reference project' }).click();
	await expect(page).toHaveURL(/\/import$/);

	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add photos' }).click();
	await (await chooser).setFiles(files);
	await expect(page.getByRole('heading', { name: `${files.length} photos` })).toBeVisible({
		timeout: 120_000
	});

	await page.getByRole('link', { name: 'Done' }).click();
	await expect(page.getByRole('heading', { name: 'Grid row' })).toBeVisible();
	await expect(page.getByLabel(/^Carousel \d/)).toHaveCount(3);
	await expect(page.getByText('6 slides')).toBeVisible();
	await page.waitForTimeout(500); // let canvases draw
	await page.screenshot({ path: resolve('test-results/reference-hub.png') });

	await page.getByRole('link', { name: 'Export' }).click();
	await expect(page.getByRole('heading', { name: /^Post 3/ })).toBeVisible({ timeout: 60_000 });
	await expect(page.locator('main img')).toHaveCount(4 + 6 + 5);
	// Exports are rendered at 2x: 2160x2700.
	const size = await page
		.locator('main img')
		.first()
		.evaluate(async (img: HTMLImageElement) => {
			await img.decode();
			return [img.naturalWidth, img.naturalHeight];
		});
	expect(size).toEqual([2160, 2700]);

	// No share sheet in desktop Chromium, so the button falls back to downloads.
	mkdirSync(OUT, { recursive: true });
	for (const post of [1, 2, 3]) {
		const section = page.locator('section', {
			has: page.getByRole('heading', { name: new RegExp(`^Post ${post}`) })
		});
		const count = await section.locator('img').count();
		const downloads: Promise<void>[] = [];
		const done = new Promise<void>((resolveAll) => {
			let seen = 0;
			page.on('download', function onDownload(d) {
				downloads.push(d.saveAs(join(OUT, d.suggestedFilename())));
				if (++seen === count) {
					page.off('download', onDownload);
					resolveAll();
				}
			});
		});
		await section.getByRole('button', { name: 'Download' }).click();
		await done;
		await Promise.all(downloads);
	}
	expect(readdirSync(OUT).filter((f) => f.endsWith('.jpg'))).toHaveLength(15);
});
