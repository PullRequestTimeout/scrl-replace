import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const GALLERY = resolve('example-gallery');
const files = existsSync(GALLERY)
	? readdirSync(GALLERY)
			.filter((f) => /\.jpe?g$/i.test(f))
			.sort()
			.slice(0, 5)
			.map((f) => join(GALLERY, f))
	: [];

test.use({ viewport: { width: 393, height: 852 } });
test.skip(files.length === 0, 'example-gallery/ not present');

/** First carousel of the only project, as saved in IndexedDB. */
function savedCarousel(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((res, rej) => {
			const r = indexedDB.open('strip');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const projects = await new Promise<{ carousels: unknown[] | null }[]>((res) => {
			const q = db.transaction('projects').objectStore('projects').getAll();
			q.onsuccess = () => res(q.result);
		});
		db.close();
		return projects[0]?.carousels?.[0] as
			| {
					slideCount: number;
					backgrounds: { photoId: string | null }[];
					frames: { x: number; y: number; crop: { fx: number } }[];
			  }
			| undefined;
	});
}

test('builds a carousel by hand: fill, add frame, drag, undo/redo, crop, add slide, export', async ({
	page
}) => {
	test.setTimeout(120_000);
	await page.goto('/');
	await page.getByRole('button', { name: 'New project' }).first().click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add photos' }).click();
	await (await chooser).setFiles(files);
	await expect(page.getByRole('heading', { name: `${files.length} photos` })).toBeVisible({
		timeout: 60_000
	});
	await page.getByRole('link', { name: 'Done' }).click();

	await page.getByRole('button', { name: 'Build by hand' }).click();
	await expect(page.getByLabel(/^Carousel 1/)).toBeVisible();
	await page.getByLabel(/^Carousel 1/).click();

	const surface = page.getByRole('application');
	await expect(surface).toBeVisible();
	const box = (await surface.boundingBox())!;
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;

	// Empty background: tapping opens the photo tray.
	await page.mouse.click(cx, cy);
	await expect(page.getByRole('heading', { name: 'Choose a photo' })).toBeVisible();
	await page.getByRole('dialog').getByRole('button').first().click();
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect.poll(async () => (await savedCarousel(page))?.backgrounds[0].photoId).toBeTruthy();

	// Deselect by tapping the empty space below the strip, then add a frame.
	await page.mouse.click(cx, box.y + box.height + 60);
	await expect(page.getByRole('button', { name: 'Deselect' })).toBeHidden();
	await page.getByRole('button', { name: 'Add frame' }).click();
	await page.getByRole('dialog').getByRole('button').nth(1).click();
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page.getByRole('slider', { name: 'Border width' })).toBeVisible();
	await expect.poll(async () => (await savedCarousel(page))?.frames.length).toBe(1);
	const before = (await savedCarousel(page))!.frames[0];

	// Drag the frame right and down.
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 6, cy + i * 3);
	await page.mouse.up();
	await expect
		.poll(async () => (await savedCarousel(page))!.frames[0].x)
		.toBeGreaterThan(before.x + 50);

	// Undo puts it back; redo moves it again.
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await savedCarousel(page))!.frames[0].x).toBeCloseTo(before.x, 0);
	await page.getByRole('button', { name: 'Redo' }).click();
	await expect
		.poll(async () => (await savedCarousel(page))!.frames[0].x)
		.toBeGreaterThan(before.x + 50);

	// Make the frame square (a landscape photo then has room to pan), enter crop mode from
	// the toolbar, and drag the photo inside its frame.
	await page.getByRole('button', { name: '1:1' }).click();
	const moved = (await savedCarousel(page))!.frames[0];
	await page.getByRole('button', { name: 'Crop' }).click();
	await expect(page.getByRole('slider', { name: 'Crop zoom' })).toBeVisible();
	const fx = cx + 60;
	const fy = cy + 30;
	await page.mouse.move(fx, fy);
	await page.mouse.down();
	for (let i = 1; i <= 8; i++) await page.mouse.move(fx + i * 5, fy);
	await page.mouse.up();
	await page.getByRole('button', { name: 'Done' }).click();
	await expect
		.poll(async () => (await savedCarousel(page))!.frames[0].crop.fx)
		.not.toBeCloseTo(moved.crop.fx, 3);

	// Deselect and add a slide.
	await page.getByRole('button', { name: 'Deselect' }).click();
	await page.getByRole('button', { name: 'Add slide' }).click();
	await expect(page.getByText('4 slides')).toBeVisible();
	await expect.poll(async () => (await savedCarousel(page))!.slideCount).toBe(4);

	// Back on the overview the strip reflects the edits; export renders.
	await page.getByRole('link', { name: 'Project' }).click();
	await expect(page.getByLabel(/^Carousel 1, left tile, 4 slides/)).toBeVisible();
	await page.getByRole('link', { name: 'Export' }).click();
	await expect(page.getByRole('heading', { name: /^Post 3/ })).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText('still has empty backgrounds')).toHaveCount(2);
});
