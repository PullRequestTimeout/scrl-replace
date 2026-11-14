# Strip

An offline iPhone web app (PWA) that turns a shoot into an Instagram grid row and three carousels, in the style of SCRL. All photo processing happens on the device. See [PLAN.md](PLAN.md) for the full plan.

## Stack

SvelteKit 3 (Svelte 5 runes, TypeScript) as a static single-page app, Tailwind v4 + shadcn-svelte, `@vite-pwa/sveltekit` (Workbox) for offline, IndexedDB (`idb`) for storage, and a Comlink web worker for image processing.

SvelteKit 3 notes: config lives in `vite.config.ts` (there's no `svelte.config.js`), and `$lib` is now `#lib` with explicit file extensions (`#lib/foo.ts`).

## Commands

| Command             | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run dev`       | Dev server (service worker disabled)                                     |
| `npm run build`     | Production build to `build/`                                             |
| `npm run preview`   | Serve `build/` like Netlify does (SPA fallback to `200.html`)            |
| `npm run check`     | Type-check                                                               |
| `npm run test:unit` | Vitest unit tests                                                        |
| `npm run test:e2e`  | Playwright tests: offline install, and import (needs `example-gallery/`) |
| `npm run icons`     | Regenerate app icons from `static/favicon.svg`                           |

Use `npm run preview`, not `vite preview`. SvelteKit's preview server doesn't serve `200.html`, so the service worker fails to precache there.

On Windows, `npm run test:unit` normalises the drive-letter case. Running `vitest` directly from a lowercase `c:\` path fails (see `vitest.config.ts`).

npm 10.1 crashes installing this tree ("Cannot read properties of null (reading 'edgesOut')"). Use npm 11 (`npx npm@11 install`) or upgrade npm.

## Private photos

`example-gallery/` and `og-gallery/` contain photos of real people. They're git-ignored and must never be committed, deployed or uploaded.

## Deploying

Netlify builds with `npm run build` and publishes `build/` (see `netlify.toml`). `static/_redirects` sends every route to `200.html`, and `static/_headers` stops the service worker and manifest from being cached.
