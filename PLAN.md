# SCRL Replacement: Build Plan

Status: **Approved. Phase 1 built; waiting for the on-iPhone check and Netlify deploy.**

## 1. Goal

This is an iPhone-only web app you install to your Home Screen. It takes 10–25 already-edited photos from one shoot and turns them into:

- **Three carousels.** Their first slides make one row of your profile grid. That row is either one wide image split across the three tiles, or three photos with a matched look.
- **Carousel layouts in your style.** Background photos run across the slides, and white-framed photos sit across the slide edges.

The app suggests options, you adjust them, and it exports 1080×1350 slides to Photos. After install it works fully offline, and all processing happens on the phone.

### Not doing (v1)

- No AI models.
- No converting photos to black and white.
- No colour grading.
- No accounts or cloud sync.
- No posting to Instagram from the app.
- No preview over your profile grid. That's in Phase 6.
- Only you will use it, so most style values are tuned in code and in presets rather than shown as settings.

---

## 2. Your style as rules the app can follow

These rules come from measuring your three exported carousels. They drive both the suggestions and the checks that keep layouts valid.

| #   | Rule                                                                                                                                   | Hard / soft                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| R1  | A slide is 1080×1350. A carousel has 3–10 slides and is treated as one horizontal strip `slideCount × 1080` wide.                      | Hard                           |
| R2  | Every pixel of the strip is covered by background photos, which fill their area edge to edge with no gaps.                             | Hard                           |
| R3  | Slide 1 (the grid tile) is one background photo with nothing on top of it.                                                             | Hard                           |
| R4  | The last slide is mostly clear. A frame may reach in a little.                                                                         | Soft                           |
| R5  | A landscape background spans about 1.3–2.2 slides. A portrait background spans about 0.8–1.1 slides.                                   | Soft                           |
| R6  | Joins between background photos land away from slide edges (at least 120 px from one).                                                 | Soft                           |
| R7  | A frame has a white border (20 px by default, adjustable) and no shadow.                                                               | Preset                         |
| R8  | A frame crosses at least one slide edge, with at least 15% of its width on each side.                                                  | Hard-ish (strong penalty)      |
| R9  | A frame preferably covers a join between background photos.                                                                            | Soft (strong)                  |
| R10 | A frame sits fully inside the slide top to bottom, at least 40 px from the top and bottom edges.                                       | Hard                           |
| R11 | A frame is 50–90% of the slide height.                                                                                                 | Soft                           |
| R12 | A frame doesn't cover the subject of the background behind it, and sits over quieter areas instead.                                    | Soft (strong)                  |
| R13 | A frame contrasts with its background: colour over black-and-white or the reverse, or else a clear difference in brightness or colour. | Soft                           |
| R14 | Frames don't overlap each other. There's at least 0.3 of a slide between them.                                                         | Hard                           |
| R15 | There are about `round(photos / 3)` frames per carousel, and about `photos − 1` slides.                                                | Soft (sets the starting count) |
| R16 | Two near-duplicate photos never sit next to each other.                                                                                | Soft                           |

Your examples matched these numbers: 4 slides with 5 photos (3 backgrounds and 2 frames), 6 slides with 6 photos, and 5 slides with 6 photos.

**How "soft" rules work:** every soft rule becomes a weighted term in a scoring function. The weights live in a **style preset**, so the app can be re-tuned without code changes.

**Calibrating against your posts:** as test cases, I'll rebuild your three carousels in the app's layout format. Then I tune the scoring so your real posts score in the top few percent of randomly generated layouts. If they don't, the rules are wrong.

---

## 3. Tech stack

| Concern               | Choice                                                                       | Why                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Framework             | SvelteKit 2 + Svelte 5 (runes) + TypeScript                                  | As agreed                                                                                                                          |
| Build output          | `adapter-static`, served as one page that handles all routes (`ssr = false`) | Fully static, so it runs offline and deploys to Netlify                                                                            |
| Offline install       | `@vite-pwa/sveltekit` (Workbox)                                              | Caches every built file, works with the single-page fallback, shows an update prompt                                               |
| UI                    | shadcn-svelte (Bits UI + Tailwind v4), dark theme                            | Agreed. Its Drawer component gives the bottom sheets the editor needs.                                                             |
| Background work       | One dedicated image worker                                                   | Keeps the screen responsive while images are processed                                                                             |
| Talking to the worker | Comlink (~1 KB)                                                              | Lets the main app call worker functions directly                                                                                   |
| Storage               | IndexedDB via `idb` (~1 KB): project data and image files                    | Safari reliably stores image files in IndexedDB. The browser's other file store (OPFS) behaves inconsistently across iOS versions. |
| Reading photo dates   | `exifr` (lite build)                                                         | Reads the capture date **when it's there**. It's optional: nothing depends on it.                                                  |
| Tests                 | Vitest for the layout logic; Playwright (WebKit, iPhone emulation) for flows |                                                                                                                                    |
| Hosting               | Netlify (static, HTTPS)                                                      | Agreed                                                                                                                             |

Before setting up, I'll check current docs (via Context7) for the exact versions and config of SvelteKit, `@vite-pwa/sveltekit` and shadcn-svelte.

**Git:** this folder isn't a git repository yet. I'll run `git init` in Phase 1 but won't commit unless you ask. Netlify can deploy straight from the folder with its CLI, or from a repo if you'd rather push to GitHub.

---

## 4. Architecture

### 4.1 Folder layout

```
src/
  lib/
    model/        types.ts, constants.ts, presets.ts
    analysis/     color.ts, saliency.ts, horizon.ts, hash.ts, features.ts   (worker-side)
    layout/       rng.ts, row.ts, assign.ts, carousel.ts, score.ts, validate.ts, diversity.ts
    render/       draw.ts (one drawing function used for preview and export), bitmap-cache.ts
    workers/      image.worker.ts (import, resize, analysis, export rendering)
    storage/      db.ts, projects.ts, blobs.ts
    editor/       editor.svelte.ts (editor state), history.ts (undo/redo), gestures.ts, snapping.ts
    components/
      ui/         shadcn-svelte components
      app/        StripView, SlideCanvas, PhotoTray, RowPreview, OptionCarousel, ...
  routes/
    +layout.ts                    ssr = false, prerender = false
    +page.svelte                  project list
    p/[id]/import/+page.svelte
    p/[id]/row/+page.svelte
    p/[id]/c/[n]/+page.svelte     options screen, then editor (n = 1..3)
    p/[id]/export/+page.svelte
    settings/+page.svelte         presets, storage use, app version
```

### 4.2 Constants

```ts
SLIDE_W = 1080;
SLIDE_H = 1350;
GRID_VISIBLE_W = (SLIDE_H * 3) / 4; // 1012.5: how much of the tile the profile grid shows
GRID_HIDDEN_SIDE = (SLIDE_W - GRID_VISIBLE_W) / 2; // 33.75 px hidden on each side
WORKING_LONG_EDGE = 3200; // big enough for a split panorama (see 6.2)
PREVIEW_LONG_EDGE = 1024;
THUMB_LONG_EDGE = 256; // also the size analysis runs at
EXPORT_JPEG_QUALITY = 0.92;
```

Before Phase 4, I'll check the 3:4 grid crop against a real profile screenshot. It's kept as one constant, so it's a one-line change if Instagram changes it.

### 4.3 Data model

All layout positions are in **strip pixels** (slide k covers `x ∈ [k·1080, (k+1)·1080)`). Photos use 0–1 coordinates, so the model doesn't depend on image size.

```ts
type PhotoId = string;

interface Photo {
	id: PhotoId;
	name: string;
	width: number;
	height: number; // original pixel size
	capturedAt?: number; // EXIF date if present. No fallback: the file's modified date
	// from the iOS picker is the import time, which is misleading.
	analysis: PhotoAnalysis;
	// image files are stored separately: working (3200px), preview (1024px), thumb (256px)
}

interface PhotoAnalysis {
	aspect: number; // width / height
	orientation: 'landscape' | 'portrait' | 'square';
	isMono: boolean;
	lumaMean: number;
	lumaStd: number; // brightness and contrast
	warmth: number; // warm-to-cool colour balance
	dominant: Lab[]; // 3 main colours
	saliency: { cx: number; cy: number; box: Rect01; map: Uint8Array /* 32×40 grid */ };
	horizonY: number | null; // 0..1
	shot: 'wide' | 'medium' | 'close'; // guessed from how much of the frame the subject fills
	dhash: bigint; // fingerprint for spotting near-duplicates
}

// How a photo fills a box: like CSS "cover", plus a focus point and zoom
interface Crop {
	fx: number;
	fy: number;
	zoom: number;
} // fx, fy in 0..1; zoom >= 1

interface Background {
	photoId: PhotoId;
	x0: number;
	x1: number;
	crop: Crop;
} // full height
interface Frame {
	id: string;
	photoId: PhotoId;
	x: number;
	y: number;
	h: number; // outer box including border; width = h × photo aspect unless cropped
	aspect: number; // inner aspect (the photo's own by default)
	border: number;
	crop: Crop;
	z: number;
}

interface Carousel {
	slideCount: number;
	backgrounds: Background[]; // sorted, each one starting where the last ends, covering [0, slideCount·1080)
	frames: Frame[];
	locked: { slide0: true }; // slide 1 always comes from the grid row
}

type GridRow =
	| { mode: 'split'; photoId: PhotoId; crop: PanoramaCrop } // one wide crop, cut into 3 tiles
	| { mode: 'matched'; tiles: [PhotoId, PhotoId, PhotoId]; crops: [Crop, Crop, Crop] };

interface Project {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	photoIds: PhotoId[];
	presetId: string;
	row: GridRow | null;
	pinnedTiles: (PhotoId | null)[]; // tiles you chose yourself (left, middle, right)
	carousels: [Carousel, Carousel, Carousel] | null; // index 0 = left tile
	exportState: { posted: boolean[] };
}

interface StylePreset {
	id: string;
	name: string;
	border: number; // 20
	frameHeight: [number, number]; // [0.5, 0.9] of the slide height
	bgSpanLandscape: [number, number]; // [1.3, 2.2] slides
	bgSpanPortrait: [number, number];
	seamClearance: number; // 120
	weights: Record<ScoreTerm, number>;
}
```

The grid tile always comes from the row. For a split row, slide 1 of each carousel is a fixed background whose crop is calculated from the row (see 6.2). It can only be changed on the row screen.

### 4.4 Image pipeline and memory

iOS kills tabs that use too much memory. 25 decoded photos at 3200 px would take about 680 MB, so:

1. **Import** (in the worker, one file at a time): `createImageBitmap(file)`, then shrink it into three JPEGs (working 3200, preview 1024, thumb 256). Read the capture date if there is one. Run analysis on the thumb. Save the files to IndexedDB, then release the decoded image straight away.
2. **Preview drawing** uses only the 1024 px images, kept in a memory cache of at most 8 decoded images. Thumbs stay in memory for the whole session.
3. **Export** renders one slide at a time on a single 1080×1350 canvas in the worker. It decodes only the working images that slide needs, then releases them.
4. Large downscales are done in steps (halving each time) with high-quality smoothing, so the result stays sharp.

**Colour space:** iPhone photos are often in Display P3. Safari's canvas can work in P3, but whether Instagram keeps P3 correctly is uncertain. Phase 2 includes a test on your device comparing an sRGB export with a P3 export after upload. The winner becomes the default.

### 4.5 One drawing function for preview and export

`draw(ctx, carousel, photos, bitmaps, { scale, slideRange, overlays })` is a plain function that takes only a 2D drawing context. The editor calls it on an on-screen canvas at screen scale. The worker calls it at 1:1 for each slide on an off-screen canvas. Using the same code means the export matches the preview exactly. Editor overlays (slide edges, grid-crop guides, selection handles) are drawn only on screen.

---

## 5. Screens and flow

```
Projects ─▶ Import ─▶ Grid row ─▶ Carousel 1 ─▶ Carousel 2 ─▶ Carousel 3 ─▶ Export
                        ▲               (options ▶ editor, for each carousel)
                        └─ changing the row or its photos redistributes the carousels (with a warning)
```

1. **Projects:** a list of projects with their row thumbnail, plus New project, Duplicate and Delete. Storage use is shown in Settings.
2. **Import:** the iOS photo picker (`<input type="file" accept="image/*" multiple>`). You can add more photos later.
   - A progress bar shows import and analysis.
   - Thumbnails appear in a grid. Long-press one to remove it or view it large.
   - Each thumbnail has small badges: B&W, landscape or portrait, and "low resolution" if it's too small to be the split panorama.
3. **Grid row:**
   - 3–5 row options to swipe through, mixing split and matched rows.
   - Each option is shown as the profile grid would show it (three 3:4 crops with a 2 px gap). A toggle switches to the full 4:5 slides.
   - Tap a tile to **pin** it or swap its photo. Pinned tiles stay put when you regenerate, and the other tiles are re-suggested to match.
   - A split / matched / either filter.
   - Drag to move a split row's crop.
4. **Carousel n, options:** 3–5 layout options shown as small strips to swipe through. "Regenerate" makes a new batch, keeping the photos assigned to this carousel. A tray shows which photos this carousel uses, and you can move photos between carousels.
5. **Carousel n, editor:** see section 7.
6. **Export:** one card per carousel, **in posting order**: "Post 1: right tile", "Post 2: middle", "Post 3: left".
   - Each card has a **Save to Photos** button, and you can mark it as posted.
   - Files are named `p{postOrder}-s{slide:02}.jpg`.

---

## 6. Suggestion engine

Everything runs in the worker. It's predictable: each suggestion has a seed, so "Regenerate" changes the seed, and test results are repeatable.

### 6.1 Analysis (per photo, on the 256 px thumb, about 10–20 ms each)

| What it measures                | How                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B&W                             | Average colourfulness below a threshold (to allow for slightly tinted black-and-white)                                                                              |
| Brightness and contrast         | Average and spread of brightness                                                                                                                                    |
| Main colours and warmth         | Groups the photo's colours into 3 clusters; warmth from the warm/cool balance                                                                                       |
| Where the subject is (saliency) | A small, standard "what stands out" calculation (spectral residual), blended with edge strength, smoothed, reduced to a 32×40 grid. Gives a centre point and a box. |
| Horizon                         | The row with the strongest long horizontal edge, if it's clear enough                                                                                               |
| Shot type                       | From the subject box size: < 12% of the frame = wide, > 35% = close, otherwise medium                                                                               |
| Near-duplicates                 | A 64-bit fingerprint (dHash). Photos within 10 bits of each other count as near-duplicates.                                                                         |

### 6.2 Grid row

**Split row (lined up for the grid view):**

- The three visible areas sit side by side with no overlap. Each one is 1012.5 px wide (with an optional 2 px gutter).
- Each tile's full 1080 px slide is its visible area **plus 33.75 px on each side**, taken from the same wide image. Neighbouring slides therefore repeat about 67 px of content, which is hidden in the grid.
- The wide crop needs to be about 3105×1350 at output size, so roughly **2.3:1**. A 3:2 photo keeps about 65% of its height.
- Who qualifies: landscape photos whose working image is at least about 3105 px wide after cropping.
- How candidates are scored:
  - the subject is spread across the width, or crosses a tile cut on purpose (like the wheelie);
  - the subject isn't cut through its middle by a tile edge;
  - there's a horizon;
  - the crop doesn't zoom in too far.
- The crop's vertical position is chosen to keep the subject and horizon in frame.

**Matched row:**

- Picks 3 photos whose overall tone is as similar as possible: main colours, brightness, warmth, and all colour or all black-and-white.
- Rewards variety in composition:
  - subject positions spread left, middle and right;
  - different shot types (like the dog row: close, wide, close);
  - subjects on the outer tiles that face or sit toward the centre, judged from where the subject sits in the photo.
- Each tile's crop is the 3:4 visible area centred on the subject. The extra hidden edge comes from the photo itself.

**Pinned tiles:** pinned photos are fixed. The search only fills the open slots, scored against the pinned photos.

**Choosing which options to show:** generate every candidate (all split candidates, plus the top 200 matched trios), then pick 3–5 that are good _and_ different from each other. Each pick balances its score against how similar it is to the ones already chosen.

### 6.3 Splitting photos across the three carousels

1. Each carousel starts from its row tile. For a split row, all three carousels share the panorama's theme, so photos are spread by grouping similar-looking photos instead (tone, B&W or colour, shot type).
2. Every remaining photo goes to the carousel it suits best, judged by how similar its tone is to that carousel's photos. Carousel sizes are kept within ±1 of each other.
   - **Capture time is an optional bonus.** If every photo has a date, being close in time adds a small amount to the match. If some or all photos have no date, the time term is switched off for the whole set and nothing else changes.
3. Near-duplicates end up in different carousels, or at least not next to each other.
4. You can override this from each carousel's photo tray. Moving a photo between carousels invalidates just those two carousels' suggestions.

### 6.4 Carousel layout

For each carousel, the worker generates about 500 candidate layouts (well under 200 ms in total) using these steps:

1. **Choose roles:** each photo becomes a _background_ or a _frame_.
   - Landscape photos lean toward backgrounds.
   - Photos that contrast with their likely neighbour lean toward frames.
   - The frame count follows R15, give or take one.
2. **Order the photos for flow:**
   - Mix shot types and alternate colour and black-and-white where possible (rule R16 applies).
   - Break ties by capture time if every photo has one, otherwise by import order.
   - Slide 1 is always the row tile.
3. **Lay out the backgrounds:** slide 1 is exactly 1080 px. Each later background gets a width drawn from its span range (R5). The last one is stretched or squeezed so the total is a whole number of slides (giving `slideCount`). Joins are nudged away from slide edges (R6).
4. **Crop the backgrounds:** set the focus point from the subject position, and keep zoom at 1 unless the photo is too narrow for its span. Where horizons are found, nudge neighbouring backgrounds so their horizons roughly line up.
5. **Place the frames:**
   - Each frame goes on a slide edge near a background join (R8, R9).
   - Height is drawn from the R11 range, and vertical position comes from where the background behind is quietest (R10, R12).
   - Each frame's horizontal position is then searched for the spot where it covers the least of the background's subject.
6. **Check and score:** layouts that break a hard rule are discarded. Each remaining layout gets the weighted total of its soft-rule scores, and 3–5 good but varied layouts are picked as in 6.2.

The checking function is also used live in the editor to show warnings, without blocking you. For example: "frame covers the subject", or "join on a slide edge".

---

## 7. Editor (carousel n)

**Layout:**

- The strip is shown at full screen width. Two zoom levels: **Overview** (the whole strip fits) and **Slide** (one slide fills the width, swipe to scroll).
- Slide edges are drawn as thin lines. Slide 1 shows guides for the parts the grid crops off.
- The **bottom sheet** (shadcn Drawer) changes depending on what's selected.

**Gestures:**

| Action                                              | Gesture                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Select a frame or background                        | Tap                                                                                                                                              |
| Move a frame                                        | Drag (snaps to slide edges, background joins, vertical centre and the R10 margins)                                                               |
| Resize a frame                                      | Drag a corner handle (keeps the shape), or a slider in the sheet                                                                                 |
| Move or zoom a photo inside its frame or background | Double-tap to enter crop mode, then drag or pinch. Tap outside to finish.                                                                        |
| Move a background join                              | Drag the join handle (the two neighbours share the width; minimum width enforced)                                                                |
| Swap a photo                                        | Sheet → "Replace" opens the photo tray. Or "Swap with…" another photo in this carousel.                                                          |
| Add or remove a slide                               | Sheet buttons. Adding stretches the last background (or adds an unused photo). Removing shrinks it and moves any frames that were on that slide. |
| Undo / redo                                         | Header buttons (stores up to 100 steps)                                                                                                          |

**Sheet when a frame is selected:** border thickness, replace, swap, change the shape (back to the photo's own shape, or crop to 4:5 / 1:1 / 3:2), send backward or bring forward, turn into a background, delete.

**Sheet when a background is selected:** replace, swap, turn into a frame, delete (the neighbours expand to fill the space).

**Rule warnings:** a small badge shows broken soft rules. Tap it to see the list.

**Saving:** changes are saved to IndexedDB automatically about 500 ms after you stop editing, and when the app goes to the background.

Gestures use Pointer Events with `touch-action: none` on the canvas. Pinch is handled by tracking two pointers. No gesture library.

---

## 8. Export to Photos

- When you open the Export screen, the worker renders every slide to JPEG in the background and turns them into `File` objects, with progress shown per carousel.
- **Save to Photos** calls `navigator.share({ files })` **directly inside the tap**. iOS refuses to share if it happens after any waiting, which is why the files are prepared first. In the share sheet you choose "Save N Images".
- There's one share per carousel. That keeps each post's slides together in Photos and in posting order.
- **Fallback** if sharing is refused: open the image large so you can long-press and save it.
- Before showing the button, the app checks `navigator.canShare({ files })`.

---

## 9. Offline install and storage

- **Manifest:** name, short name, dark theme colour, standalone display, portrait orientation, app icons (192, 512 and a maskable version), and the Apple touch icon and status-bar tags.
- **Caching:** Workbox caches every built file. Any page you open offline loads the main app page. Updates use a **prompt**, not an automatic update, so a reload never interrupts an edit ("Update available, reload").
- **Storage:** `navigator.storage.persist()` is requested on first import. Settings shows storage use and lets you delete projects. One project with 25 photos is about 40–60 MB, mostly the 3200 px working images.
- **Install:** iOS only keeps saved data reliably for Home Screen apps. When opened in Safari, the app shows an "Add to Home Screen" banner.
- **Netlify:**
  - Publish the `build/` folder.
  - `_headers` stops the service worker file and manifest from being cached.
  - `_redirects` sends every route to the main app page.

---

## 10. Phases

Each phase ends with a **check on your iPhone** before the next one starts.

### Phase 1: Foundation

- Set up the SvelteKit project, TypeScript, Tailwind v4, shadcn-svelte (dark theme) and the static build.
- Offline install: manifest, placeholder icons, update prompt.
- IndexedDB storage and the projects list (create, rename, delete, duplicate).
- The image worker: import pipeline (shrink to the three sizes, capture date, thumbs) with progress.
- Import screen with the thumbnail grid and remove.
- Deploy to Netlify.
- **Done when:** installed from Netlify to your Home Screen, it opens in airplane mode, imports the 23-photo example gallery without crashing, and the photos are still there after closing and reopening.

### Phase 2: Layout format, drawing and export

- Model types and constants, the shared drawing function, and the image cache.
- Rebuild your 3 example carousels as test layouts and show them read-only.
- Export screen: render in the worker, share sheet, posting-order labels.
- Test sRGB vs P3 after uploading to Instagram.
- **Done when:** your rebuilt carousel exports, saves to Photos, posts to Instagram, and matches your original SCRL version.

### Phase 3: Editor

- Strip view with the two zoom levels, selection, dragging, resizing, crop mode, join handles.
- Add and remove slides, swap and replace, photo tray, undo and redo, auto-save.
- Snapping, and grid-crop guides on slide 1.
- **Done when:** you can build a carousel by hand from scratch, as fast as in SCRL or faster.

### Phase 4: Suggestion engine

- Analysis functions, with Vitest checks on test images made from `example-gallery/`.
- Grid row options (split and matched), pinned tiles, the row screen with the grid / full-slide toggle.
- Splitting photos across carousels, carousel layout options, the checks and scoring, picking varied options.
- Tune the weights against your 3 examples.
- **Done when:** from a real shoot, at least one of the 3–5 options per carousel needs only small edits.

### Phase 5: Presets and polish

- Style presets: save, choose and duplicate. The default matches your current style.
- Live rule warnings in the editor, an empty-state guide, haptics where iOS supports them, and the final icon.
- Performance pass (imports, opening the editor, export time).

### Phase 6 (later): Grid preview

- Import a screenshot of your profile, find the grid, and overlay the new row on top.

---

## 11. Risks and unknowns

| Risk                                                                | Plan                                                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory limits on iPhone                                             | Shrink images on import, cache decoded images within a fixed limit, render one slide at a time. Load-tested with 25 photos at 24–45 MP in Phase 1. |
| Sharing refused because the tap "expired" while files were prepared | Prepare files in advance and share right inside the tap. Fall back to long-press saving.                                                           |
| P3 colours shift after uploading to Instagram                       | On-device comparison in Phase 2                                                                                                                    |
| Instagram changes the grid crop or the carousel size                | Kept in single constants                                                                                                                           |
| iOS clearing saved data                                             | Home Screen install plus a persistent-storage request. Possibly add a project backup and restore (zip) later.                                      |
| Suggestions feel generic                                            | Calibration against your real posts. The weights are tunable in presets. Adding AI later is possible because analysis is one separate module.      |

---

## 12. Testing

- **Vitest:** the layout checks (hard rules), scoring (your examples score above random layouts), the split-row maths, splitting photos across carousels, repeatable seeded results, and analysis on test images.
- **Playwright (WebKit, iPhone 15 emulation):** import, generate, edit, export flow, and offline reload. Device emulation can't test the share sheet or memory limits.
- **Checks on your iPhone** at the end of each phase (section 10). Those are the real sign-off.

---

### Example gallery (`example-gallery/`)

There are 23 edited JPEGs from one wedding day, with these properties:

- **Size:** 1873–6507 px wide, up to 31 MB and about 45 MP each. A good worst case for memory.
- **Shapes:** very mixed (wide-to-high from 0.67 to 1.79): 4:5-ish and 1:1 portrait crops, 3:2 and wider landscapes.
  - So frames keep each photo's own shape, and backgrounds are cropped to fill.
  - `-128` and `-155` (about 1.75:1, 6400+ px wide) are the obvious split-row candidates.
  - `-104` (1873 px wide) should get the "low resolution" badge.
- **Capture dates:** all have one. Tests also run the photos with dates removed, to prove dates are optional.

These photos show real people. They stay local: the folder is listed in `.gitignore`, and they're never deployed, uploaded or published. Tests read them from disk, and only small downscaled copies are generated into a git-ignored folder.

---

## 13. What I need from you

1. **Approval** of this plan, or changes to it.
2. ~~A sample shoot~~: received (`example-gallery/`, 23 photos).
3. **The original photos behind your 3 example carousels**, if you still have them. That gives the closest possible style calibration. Otherwise I'll estimate them from the exported strips.
4. Whether you want the project on GitHub (Netlify deploys automatically on push) or deployed with the Netlify CLI from this folder.
