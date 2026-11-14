import { defineConfig } from 'vitest/config';

// Unit tests cover plain TypeScript modules (layout engine, geometry, analysis), so they
// run without the SvelteKit/PWA plugins. `#lib` resolves through package.json "imports".
//
// Windows note: run from a path with an uppercase drive letter (C:\...). A lowercase `c:`
// cwd (VS Code's default terminal) makes Vitest load two copies of itself and every suite
// fails with "Cannot read properties of undefined (reading 'config')". `npm run test:unit`
// normalises this via scripts/run-vitest.mjs.
export default defineConfig({
	test: {
		name: 'unit',
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
		expect: { requireAssertions: true }
	}
});
