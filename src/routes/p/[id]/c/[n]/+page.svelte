<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';
	import Redo2Icon from '@lucide/svelte/icons/redo-2';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { toast } from 'svelte-sonner';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import SlideCanvas from '#lib/components/app/SlideCanvas.svelte';
	import EditorCanvas, { type Zoom } from '#lib/components/editor/EditorCanvas.svelte';
	import EditorToolbar from '#lib/components/editor/EditorToolbar.svelte';
	import PhotoTray from '#lib/components/editor/PhotoTray.svelte';
	import RuleWarnings from '#lib/components/editor/RuleWarnings.svelte';
	import { checkCarousel, type RuleWarning } from '#lib/layout/warnings.ts';
	import { toLayoutPhotos } from '#lib/layout/types.ts';
	import type { StylePreset } from '#lib/model/presets.ts';
	import { ProjectData } from '#lib/stores/project-data.svelte.ts';
	import { loadPreviewSources } from '#lib/render/preview-cache.ts';
	import type { DrawSource } from '#lib/render/draw.ts';
	import type { Carousel } from '#lib/model/layout.ts';
	import { frameOuter, maxBackgroundWidth, photosIn } from '#lib/model/layout.ts';
	import type { Photo, PhotoId } from '#lib/model/types.ts';
	import { Editor } from '#lib/editor/editor.svelte.ts';
	import { addFrame, replacePhoto, swapPhotos, type ElementRef } from '#lib/editor/ops.ts';
	import { saveProject } from '#lib/storage/projects.ts';
	import { TILE_NAMES } from '#lib/export/share.ts';

	const index = Math.max(0, Math.min(2, Number(page.params.n ?? '1') - 1));
	const data = new ProjectData(page.params.id ?? '');

	let editor = $state<Editor | null>(null);
	let sources = $state(new Map<PhotoId, DrawSource>());
	let zoom = $state<Zoom>('slide');
	let centerX = $state(540);
	let mode = $state<'edit' | 'preview'>('edit');
	let tray = $state<
		| null
		| { kind: 'add' }
		| { kind: 'replace'; ref: ElementRef }
		| { kind: 'swap'; ref: ElementRef }
	>(null);
	/**
	 * Whether the photo sheet is showing. Two-way bound to the drawer so its own dismissals
	 * (swipe, overlay tap) always flow back here; otherwise iOS could leave the drawer closed
	 * while we still think it's open, and "Choose" would appear to do nothing.
	 */
	let trayOpen = $state(false);
	let current = $state(0);

	type Tray = NonNullable<typeof tray>;
	function openTray(t: Tray) {
		tray = t;
		trayOpen = true;
	}
	let scroller = $state<HTMLDivElement>();

	const photoMap = $derived(new Map(data.photos.map((p) => [p.id, p])));

	// ---------------------------------------------------------------------------
	// Live rule warnings: checked shortly after edits settle, so drags stay smooth.

	let preset = $state<StylePreset | null>(null);
	let warnings = $state<RuleWarning[]>([]);
	const layoutPhotos = $derived(new Map(toLayoutPhotos(data.photos).map((p) => [p.id, p])));

	$effect(() => {
		const c = editor?.carousel;
		const p = preset;
		const photos = layoutPhotos;
		if (!c || !p) return;
		const timer = setTimeout(() => (warnings = checkCarousel(c, photos, p)), 150);
		return () => clearTimeout(timer);
	});

	function showWarning(w: RuleWarning) {
		const t = w.target;
		if (!editor || !t) return;
		editor.select(t);
		const c = editor.carousel;
		if (t.kind === 'frame') {
			const f = c.frames.find((x) => x.id === t.id);
			if (f) zoomTo(frameOuter(f).x + frameOuter(f).w / 2);
		} else {
			const b = c.backgrounds[t.index];
			// Join notes point at the background's left edge; others at the background itself.
			if (b) zoomTo(w.key.startsWith('join-') ? b.x0 : (b.x0 + b.x1) / 2);
		}
	}

	/** Portrait backgrounds never get wider than their natural width at full slide height. */
	const widthLimit = (id: PhotoId) => {
		const p = photoMap.get(id);
		return p ? maxBackgroundWidth(p.width, p.height) : Infinity;
	};

	$effect(() => {
		void (async () => {
			await data.load();
			const carousel = data.project?.carousels?.[index];
			if (!carousel) return;
			editor = new Editor(structuredClone($state.snapshot(carousel)), scheduleSave, widthLimit);
			preset = await data.preset();
			// Decode every project photo once: replacing a photo should feel instant.
			sources = await loadPreviewSources(data.photos);
		})();
	});

	// ---------------------------------------------------------------------------
	// Saving: debounced while editing, flushed when leaving or backgrounding the app.

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let pending: Carousel | null = null;

	function scheduleSave(c: Carousel) {
		pending = c;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void flush(), 500);
	}

	async function flush() {
		clearTimeout(saveTimer);
		const c = pending;
		const project = data.project;
		if (!c || !project?.carousels) return;
		pending = null;
		const carousels = $state.snapshot(project.carousels) as [Carousel, Carousel, Carousel];
		carousels[index] = $state.snapshot(c) as Carousel;
		try {
			data.project = await saveProject({ ...$state.snapshot(project), carousels });
		} catch (e) {
			console.error(e);
			toast.error('Couldn’t save changes');
		}
	}

	function onHidden() {
		if (document.visibilityState === 'hidden') void flush();
	}
	$effect(() => {
		document.addEventListener('visibilitychange', onHidden);
		window.addEventListener('pagehide', flush);
		return () => {
			document.removeEventListener('visibilitychange', onHidden);
			window.removeEventListener('pagehide', flush);
		};
	});
	beforeNavigate(() => void flush());
	onDestroy(() => void flush());

	// ---------------------------------------------------------------------------
	// Photo tray

	const usage = $derived.by(() => {
		const map = new Map<PhotoId, string>();
		const carousels = data.project?.carousels;
		if (!carousels) return map;
		carousels.forEach((c, i) => {
			if (i === index) return;
			for (const id of photosIn(c)) map.set(id, `Carousel ${i + 1}`);
		});
		if (editor) for (const id of photosIn(editor.carousel)) map.set(id, 'Here');
		return map;
	});

	const aspectOf = (id: PhotoId) => {
		const p = photoMap.get(id);
		return p ? p.width / p.height : 1;
	};

	function pick(photo: Photo) {
		const t = tray;
		trayOpen = false;
		if (!editor || !t) return;
		const aspect = photo.width / photo.height;
		if (t.kind === 'add') {
			editor.apply(addFrame(editor.carousel, photo.id, aspect, centerX));
			const added = editor.carousel.frames.at(-1);
			if (added) editor.select({ kind: 'frame', id: added.id });
		} else if (t.kind === 'replace') {
			editor.apply(replacePhoto(editor.carousel, t.ref, photo.id, aspect, widthLimit));
		} else {
			// Swap with whichever element in this carousel uses the picked photo.
			const c = editor.carousel;
			const fi = c.frames.find((f) => f.photoId === photo.id);
			const bi = c.backgrounds.findIndex((b) => b.photoId === photo.id);
			const other: ElementRef | null = fi
				? { kind: 'frame', id: fi.id }
				: bi >= 0
					? { kind: 'bg', index: bi }
					: null;
			if (!other) {
				toast('Pick a photo that’s already in this carousel to swap with');
				return;
			}
			editor.apply(swapPhotos(c, t.ref, other, aspectOf, widthLimit));
		}
	}

	const forGridTile = $derived(
		tray?.kind === 'replace' && tray.ref.kind === 'bg' && tray.ref.index === 0
	);

	const trayPhotos = $derived.by(() => {
		// The grid tile is a single 4:5 slide: list portrait photos first.
		if (forGridTile) {
			const portrait = (p: Photo) => (p.height > p.width ? 0 : 1);
			return [...data.photos].sort((a, b) => portrait(a) - portrait(b));
		}
		if (tray?.kind !== 'swap' || !editor) return data.photos;
		const here = new Set(photosIn(editor.carousel));
		return data.photos.filter((p) => here.has(p.id));
	});

	const trayTitle = $derived(
		tray?.kind === 'add'
			? 'Add a framed photo'
			: tray?.kind === 'swap'
				? 'Swap with…'
				: forGridTile
					? 'Choose the grid tile photo'
					: 'Choose a photo'
	);

	/**
	 * Tapping empty space around the strip deselects (and leaves crop mode). Taps on the strip
	 * itself are handled by the canvas, and controls keep their own behaviour.
	 */
	function onBackdropClick(e: MouseEvent) {
		if ((e.target as Element).closest('[role="application"], button, a, input')) return;
		editor?.select(null);
	}

	function zoomTo(x: number) {
		centerX = x;
		zoom = 'slide';
	}

	function onScroll() {
		if (scroller) current = Math.round(scroller.scrollLeft / scroller.clientWidth);
	}
</script>

<AppHeader
	title="Carousel {index + 1} · {TILE_NAMES[index]} tile"
	backHref="/p/{page.params.id}"
	backLabel="Project"
>
	{#snippet actions()}
		{#if editor && mode === 'edit'}
			<Button
				variant="ghost"
				size="icon"
				disabled={!editor.canUndo}
				onclick={() => editor?.undo()}
				aria-label="Undo"
			>
				<Undo2Icon />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				disabled={!editor.canRedo}
				onclick={() => editor?.redo()}
				aria-label="Redo"
			>
				<Redo2Icon />
			</Button>
		{/if}
		<a
			href="/p/{page.params.id}/c/{index + 1}/layouts"
			class={buttonVariants({ variant: 'ghost', size: 'icon' })}
			aria-label="Other layouts"
		>
			<SparklesIcon />
		</a>
		<Button
			variant="ghost"
			size="icon"
			onclick={() => (mode = mode === 'edit' ? 'preview' : 'edit')}
			aria-label={mode === 'edit' ? 'Preview slides' : 'Back to editing'}
		>
			{#if mode === 'edit'}<EyeIcon />{:else}<PencilIcon />{/if}
		</Button>
	{/snippet}
</AppHeader>

{#if editor && mode === 'edit'}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<main
		class="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-xl flex-col pb-72"
		onclick={onBackdropClick}
	>
		<div class="flex items-center justify-between px-4 py-2">
			<div class="flex rounded-md border p-0.5 text-xs" role="group" aria-label="Zoom">
				<button
					type="button"
					class="rounded px-2 py-1 {zoom === 'overview'
						? 'bg-secondary text-foreground'
						: 'text-muted-foreground'}"
					aria-pressed={zoom === 'overview'}
					onclick={() => (zoom = 'overview')}>Whole strip</button
				>
				<button
					type="button"
					class="rounded px-2 py-1 {zoom === 'slide'
						? 'bg-secondary text-foreground'
						: 'text-muted-foreground'}"
					aria-pressed={zoom === 'slide'}
					onclick={() => (zoom = 'slide')}>Slide</button
				>
			</div>
			<div class="flex items-center gap-2">
				<RuleWarnings {warnings} onShow={showWarning} />
				<span class="text-xs text-muted-foreground tabular-nums">
					{editor.carousel.slideCount} slides
				</span>
			</div>
		</div>

		<EditorCanvas
			{editor}
			photos={photoMap}
			{sources}
			{zoom}
			bind:centerX
			onEmptyTap={(i) => openTray({ kind: 'replace', ref: { kind: 'bg', index: i } })}
			onZoomTo={zoomTo}
		/>
		{#if zoom === 'overview'}
			<p class="px-4 pt-2 text-xs text-muted-foreground">Tap a slide to zoom in and edit.</p>
		{/if}
	</main>

	<div
		class="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur"
		style="padding-bottom: env(safe-area-inset-bottom)"
	>
		<div class="mx-auto max-w-xl">
			<EditorToolbar
				{editor}
				photos={photoMap}
				onAddFrame={() => openTray({ kind: 'add' })}
				onReplace={() => editor?.selection && openTray({ kind: 'replace', ref: editor.selection })}
				onSwap={() => editor?.selection && openTray({ kind: 'swap', ref: editor.selection })}
			/>
		</div>
	</div>

	<PhotoTray
		bind:open={trayOpen}
		title={trayTitle}
		description={forGridTile
			? 'Slide 1 is also the profile grid tile. Portrait photos are listed first.'
			: undefined}
		photos={trayPhotos}
		{usage}
		onPick={pick}
	/>
{:else if editor && mode === 'preview'}
	<main class="mx-auto flex max-w-xl flex-col gap-3 py-4">
		<div
			bind:this={scroller}
			onscroll={onScroll}
			class="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain"
			aria-label="Slides"
		>
			{#each { length: editor.carousel.slideCount }, slide (slide)}
				<div class="w-full shrink-0 snap-center">
					<SlideCanvas carousel={editor.carousel} {sources} {slide} />
				</div>
			{/each}
		</div>
		<p class="text-center text-xs text-muted-foreground" aria-live="polite">
			Slide {current + 1} of {editor.carousel.slideCount}
		</p>
	</main>
{:else if data.loaded}
	<p class="p-6 text-sm text-muted-foreground">This carousel doesn’t exist yet.</p>
{/if}
