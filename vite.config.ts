import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import adapter from '@sveltejs/adapter-static';
import { withPwa } from '@vite-pwa/sveltekit';

// Single-page app: every route is served by this fallback page (Netlify rewrites to it,
// and the service worker uses it as the offline navigation fallback).
const FALLBACK = '200.html';

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
		__BUILD_DATE__: JSON.stringify(new Date().toISOString())
	},
	worker: {
		format: 'es'
	},
	plugins: [
		tailwindcss(),
		withPwa(
			{
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter({ fallback: FALLBACK })
			},
			{
				strategies: 'generateSW',
				registerType: 'prompt',
				injectRegister: false,
				scope: '/',
				base: '/',
				manifest: {
					name: 'Strip — carousel builder',
					short_name: 'Strip',
					description: 'Build Instagram carousels and grid rows from a shoot, offline.',
					start_url: '/',
					scope: '/',
					display: 'standalone',
					orientation: 'portrait',
					theme_color: '#0a0a0a',
					background_color: '#0a0a0a',
					icons: [
						{ src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
						{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
						{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
						{
							src: '/maskable-icon-512x512.png',
							sizes: '512x512',
							type: 'image/png',
							purpose: 'maskable'
						}
					]
				},
				generateSW: {
					globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2,webmanifest}'],
					cleanupOutdatedCaches: true,
					// No prerendered pages in a pure SPA; the plugin always adds that pattern.
					globStrict: false
				},
				kit: {
					adapterFallback: FALLBACK,
					spa: true,
					includeVersionFile: true
				},
				devOptions: {
					enabled: false
				}
			}
		)
	]
});
