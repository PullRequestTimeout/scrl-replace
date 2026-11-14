import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 393, height: 852 }, serviceWorkers: 'allow' });

test('installs the service worker and works offline', async ({ page, context }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

	// Wait until the service worker has precached the app. With the update prompt
	// (no clients.claim), it only controls pages loaded after it activates.
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

	await context.setOffline(true);

	// A deep link that was never visited still loads (SPA fallback from the precache).
	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

	await page.goto('/');
	await expect(page.getByRole('button', { name: 'New project' }).first()).toBeVisible();

	// Fonts and the image worker come from the precache too.
	const cached = await page.evaluate(async () => {
		const keys = (
			await Promise.all((await caches.keys()).map(async (k) => (await caches.open(k)).keys()))
		)
			.flat()
			.map((r) => r.url);
		return {
			worker: keys.some((u) => u.includes('image.worker')),
			font: keys.some((u) => u.endsWith('.woff2'))
		};
	});
	expect(cached).toEqual({ worker: true, font: true });
});
