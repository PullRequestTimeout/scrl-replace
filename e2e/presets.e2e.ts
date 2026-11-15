import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 393, height: 852 } });

function readStore<T>(page: Page, store: 'presets' | 'projects') {
	return page.evaluate(async (name) => {
		const db = await new Promise<IDBDatabase>((res, rej) => {
			const r = indexedDB.open('strip');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows = await new Promise<unknown[]>((res) => {
			const q = db.transaction(name).objectStore(name).getAll();
			q.onsuccess = () => res(q.result);
		});
		db.close();
		return rows;
	}, store) as Promise<T[]>;
}

test('makes a style, edits it, uses it for new projects and picks it per project', async ({
	page
}) => {
	await page.goto('/settings/presets');
	await expect(page.getByText('Built-in', { exact: true })).toBeVisible();

	// The built-in style is read-only.
	await page.getByRole('link', { name: /My style/ }).click();
	await expect(page.getByRole('slider', { name: 'Border' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await page.getByRole('button', { name: 'Duplicate to edit' }).click();

	// Rename and change one weight with the keyboard.
	const name = page.getByLabel('Name');
	await expect(name).toHaveValue('My style (copy)');
	await name.fill('Busy');
	await name.press('Enter');
	await expect(page.getByRole('heading', { level: 1, name: 'Busy' })).toBeVisible();
	const contrast = page.getByRole('slider', { name: /^Contrast/ });
	await contrast.focus();
	await contrast.press('ArrowRight');
	await expect
		.poll(
			async () =>
				(await readStore<{ name: string; weights: { contrast: number } }>(page, 'presets'))[0]
		)
		.toMatchObject({ name: 'Busy', weights: { contrast: 2.75 } });

	// Make it the default, then a new project starts with it.
	await page.getByRole('link', { name: 'Styles' }).click();
	await page.getByRole('button', { name: 'Style options for Busy' }).click();
	await page.getByRole('menuitem', { name: 'Use for new projects' }).click();
	await page.goto('/');
	await page.getByRole('button', { name: 'New project' }).first().click();
	await expect(page).toHaveURL(/\/import$/);
	const [project] = await readStore<{ id: string; presetId: string }>(page, 'projects');
	const [busy] = await readStore<{ id: string }>(page, 'presets');
	expect(project.presetId).toBe(busy.id);

	// Switch the project back to the built-in style.
	await page.goto(`/p/${project.id}`);
	await page.getByRole('button', { name: 'Style for suggestions: Busy' }).click();
	await page.getByRole('menuitemradio', { name: 'My style' }).click();
	await expect(page.getByRole('button', { name: 'Style for suggestions: My style' })).toBeVisible();
	await expect
		.poll(async () => (await readStore<{ presetId: string }>(page, 'projects'))[0].presetId)
		.toBe('default');
});
