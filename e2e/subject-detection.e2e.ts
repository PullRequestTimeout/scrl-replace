import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Subject detection: the Settings switch, scoring, offline use, the "Use as" tag and the
// slowdown/crash prompts. The model is served from a local copy (git-ignored; fetch it with
// `node scripts/fetch-subject-model.mjs`) so nothing is downloaded from Hugging Face.
const MODEL = resolve('fixtures/generated/models/vision_model_fp16.onnx');
const hasModel = existsSync(MODEL);
const GALLERY = resolve('example-gallery');
const photo = (name: string) => {
	const p = join(GALLERY, name);
	return existsSync(p) ? p : undefined;
};
const GUEST_BOOK = photo('Kelly&AlisaWedding-73.jpg');
const COUPLE = photo('DSC06509.jpg');
const hasPhotos = !!GUEST_BOOK && !!COUPLE;

test.use({ viewport: { width: 393, height: 852 } });

/** Serve the model from the local copy, optionally slowly. Returns a count of requests. */
async function serveModel(page: Page, delayMs = 0) {
	const body = readFileSync(MODEL);
	const hits = { count: 0 };
	await page.context().route(/huggingface\.co/, async (route) => {
		hits.count++;
		if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
		await route.fulfill({ status: 200, contentType: 'application/octet-stream', body });
	});
	return hits;
}

async function turnOn(page: Page) {
	await page.goto('/settings');
	const section = page.locator('section', { hasText: 'Subject detection' });
	await section.getByRole('button', { name: 'Download and turn on' }).click();
	await expect(section.getByRole('status')).toHaveText(/^On\. About \d+ ms per photo\.$/, {
		timeout: 60_000
	});
	return section;
}

async function importPhotos(page: Page, files: string[]): Promise<string> {
	await page.goto('/');
	await page.getByRole('button', { name: 'New project' }).first().click();
	await expect(page).toHaveURL(/\/p\/[^/]+\/import$/);
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Add photos' }).click();
	await (await chooser).setFiles(files);
	await expect(
		page.getByRole('heading', { name: `${files.length} photo${files.length === 1 ? '' : 's'}` })
	).toBeVisible({
		timeout: 60_000
	});
	return new URL(page.url()).pathname.split('/')[2];
}

/** Each stored photo's name and subject strength (undefined if not scored). */
function subjects(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((res) => {
			const r = indexedDB.open('strip');
			r.onsuccess = () => res(r.result);
		});
		const all = await new Promise<{ name: string; subject?: { strength: number } }[]>((res) => {
			const q = db.transaction('photos').objectStore('photos').getAll();
			q.onsuccess = () => res(q.result);
		});
		return Object.fromEntries(all.map((p) => [p.name, p.subject?.strength]));
	});
}

function clearSubjects(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((res) => {
			const r = indexedDB.open('strip');
			r.onsuccess = () => res(r.result);
		});
		const store = db.transaction('photos', 'readwrite').objectStore('photos');
		const all = await new Promise<Record<string, unknown>[]>((res) => {
			const q = store.getAll();
			q.onsuccess = () => res(q.result);
		});
		const tx = db.transaction('photos', 'readwrite');
		for (const p of all) {
			delete p.subject;
			tx.objectStore('photos').put(p);
		}
		await new Promise((res) => (tx.oncomplete = res));
	});
}

test.describe('with the model', () => {
	test.skip(!hasModel || !hasPhotos, 'model copy or example-gallery/ not present');

	test('turns on, scores photos, works without a connection, and turns off', async ({ page }) => {
		test.setTimeout(180_000);
		await serveModel(page);
		await turnOn(page);

		const projectId = await importPhotos(page, [GUEST_BOOK!, COUPLE!]);
		await page.goto(`/p/${projectId}/row`);
		await expect(page.getByLabel('Row options')).toBeVisible({ timeout: 60_000 });
		await expect
			.poll(() => subjects(page), { timeout: 30_000 })
			.toMatchObject({
				'Kelly&AlisaWedding-73.jpg': expect.any(Number),
				'DSC06509.jpg': expect.any(Number)
			});
		const scores = await subjects(page);
		expect(scores['Kelly&AlisaWedding-73.jpg']).toBeLessThan(0.2); // the guest book
		expect(scores['DSC06509.jpg']).toBeGreaterThan(0.8); // the couple

		// Offline: the model and runtime come from storage, nothing is fetched.
		await page.context().unrouteAll();
		let fetched = 0;
		await page.context().route(/huggingface\.co|\.wasm(\?|$)/, (route) => {
			fetched++;
			return route.abort();
		});
		await clearSubjects(page);
		await page.reload();
		await expect(page.getByLabel('Row options')).toBeVisible({ timeout: 60_000 });
		await expect
			.poll(async () => Object.values(await subjects(page)).every((s) => s !== undefined), {
				timeout: 30_000
			})
			.toBe(true);
		expect(fetched).toBe(0);

		// Off keeps the model; removing it takes two taps.
		await page.goto('/settings');
		const section = page.locator('section', { hasText: 'Subject detection' });
		await section.getByRole('button', { name: 'Turn off' }).click();
		await expect(section.getByRole('status')).toHaveText(
			'Off. The model is already on this device.'
		);
		await section.getByRole('button', { name: /^Remove model/ }).click();
		await section.getByRole('button', { name: 'Tap again to remove' }).click();
		await expect(section.getByRole('status')).toHaveText('Off.');
		await expect(section.getByRole('button', { name: 'Download and turn on' })).toBeFocused();
		expect(await page.evaluate(() => caches.has('strip-ai'))).toBe(false);
	});

	test('offers to turn it off when it keeps being slow', async ({ page }) => {
		test.setTimeout(180_000);
		await serveModel(page);
		await turnOn(page);
		const projectId = await importPhotos(page, [GUEST_BOOK!, COUPLE!]);

		// One slow run already on record; this time the model has to be fetched again, slowly
		// (past the 15 s slow-load mark), so the second slow run triggers the prompt.
		await page.evaluate(async () => {
			localStorage.setItem('pref:subject-detection-runs', '[true]');
			const cache = await caches.open('strip-ai');
			for (const req of await cache.keys()) {
				if (req.url.includes('huggingface.co')) await cache.delete(req);
			}
		});
		await page.context().unrouteAll();
		await serveModel(page, 16_000);
		await page.goto(`/p/${projectId}/row`);

		await expect(page.getByText('Subject detection is slowing suggestions down')).toBeVisible({
			timeout: 60_000
		});
		await expect(page.getByText(/Loading it took about \d+ s on this device/)).toBeVisible();
		await page.getByRole('button', { name: 'Keep it on' }).click();
		await expect(page.getByText('Subject detection is slowing suggestions down')).toHaveCount(0);
		const prefs = await page.evaluate(() => ({ ...localStorage }));
		expect(prefs['pref:subject-detection']).toBe('on');
		expect(Number(prefs['pref:subject-detection-snooze'])).toBeGreaterThan(Date.now());
	});
});

test('offers to turn it off after the app was closed mid-detection', async ({ page }) => {
	await page.goto('/');
	// What a run leaves behind when iOS kills the page part-way through.
	await page.evaluate(() => {
		localStorage.setItem('pref:subject-detection', 'on');
		localStorage.setItem('subject-detection:active', String(Date.now()));
	});
	await page.reload();
	await expect(page.getByText('Subject detection stopped unexpectedly')).toBeVisible();
	await page.getByRole('button', { name: 'Turn off' }).click();
	await expect(page.getByText('Subject detection stopped unexpectedly')).toHaveCount(0);
	const prefs = await page.evaluate(() => ({ ...localStorage }));
	expect(prefs['pref:subject-detection']).toBeUndefined();
	expect(prefs['subject-detection:active']).toBeUndefined();

	// Shown once.
	await page.reload();
	await page.waitForTimeout(1000);
	await expect(page.getByText('Subject detection stopped unexpectedly')).toHaveCount(0);
});

test('explains when this device can’t run it', async ({ page }) => {
	await page.addInitScript(() => {
		navigator.storage.estimate = async () => ({ usage: 0, quota: 10 * 1024 * 1024 });
	});
	await page.goto('/settings');
	const section = page.locator('section', { hasText: 'Subject detection' });
	await expect(section.getByRole('status')).toHaveText(
		'Not available on this device: there isn’t enough free storage.'
	);
	await expect(section.getByRole('button')).toHaveCount(0);
});

test('tags a photo as a strong subject or a background', async ({ page }) => {
	test.skip(!hasPhotos, 'example-gallery/ not present');
	await importPhotos(page, [COUPLE!]);
	const tile = page.locator('main li button').first();
	const badge = page
		.locator('main li')
		.first()
		.getByText(/^(Subject|Background)$/);

	await tile.click();
	const group = page.getByRole('radiogroup', { name: 'Use as' });
	await expect(group.getByRole('radio', { name: 'Auto' })).toBeChecked();
	await group.getByRole('radio', { name: 'Background' }).click();
	await expect(group.getByRole('radio', { name: 'Background' })).toBeChecked();
	await expect(page.getByText('Suggestions may cover it with frames.')).toBeVisible();
	// Arrow keys move the choice, as in a native radio group.
	await page.keyboard.press('ArrowLeft');
	await expect(group.getByRole('radio', { name: 'Strong subject' })).toBeChecked();
	await expect(group.getByRole('radio', { name: 'Strong subject' })).toBeFocused();
	await page.getByRole('button', { name: 'Close' }).click();

	await expect(badge).toHaveText('Subject');
	await expect(tile).toHaveAccessibleName(/marked as strong subject$/);
	await page.reload();
	await expect(badge).toHaveText('Subject');

	await tile.click();
	await page.getByRole('radio', { name: 'Auto' }).click();
	await page.getByRole('button', { name: 'Close' }).click();
	await expect(badge).toHaveCount(0);
});
