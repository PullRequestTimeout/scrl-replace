<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import CarouselStrip from '#lib/components/app/CarouselStrip.svelte';
	import { ProjectData } from '#lib/stores/project-data.svelte.ts';
	import { loadPreviewSources } from '#lib/render/preview-cache.ts';
	import type { DrawSource } from '#lib/render/draw.ts';
	import { imageWorker } from '#lib/workers/client.ts';
	import { toLayoutPhotos } from '#lib/layout/types.ts';
	import { photosIn, type Background, type Carousel } from '#lib/model/layout.ts';
	import type { PhotoId } from '#lib/model/types.ts';
	import { isLocked, isSplitRow, tileChanged } from '#lib/model/locks.ts';
	import { saveProject } from '#lib/storage/projects.ts';
	import { TILE_NAMES } from '#lib/export/share.ts';

	const index = Math.max(0, Math.min(2, Number(page.params.n ?? '1') - 1));
	const data = new ProjectData(page.params.id ?? '');
	let sources = $state(new Map<PhotoId, DrawSource>());
	let layouts = $state<Carousel[]>([]);
	let loading = $state(true);
	let seed = $state(1);
	let choosing = $state<Carousel | null>(null);

	$effect(() => {
		void (async () => {
			await data.load();
			sources = await loadPreviewSources(data.photos);
			await data.ensureAnalysis();
			seed = (Date.now() % 10_000) + 1;
			await generate();
		})();
	});

	/** The tile stays as chosen; the photos are whatever this carousel uses now. */
	function inputs(): { tile: Background; photoIds: PhotoId[] } | null {
		const project = data.project;
		const current = project?.carousels?.[index];
		if (!project || !current) return null;
		const tile = $state.snapshot(current.backgrounds[0]) as Background;
		if (!tile.photoId) return null;
		const ids = photosIn(current).filter((id) => id !== tile.photoId);
		return { tile, photoIds: [...new Set(ids)] };
	}

	async function generate() {
		const input = inputs();
		if (!input || locked) {
			loading = false;
			return;
		}
		loading = true;
		try {
			const options = await imageWorker().suggestFor(
				input.tile,
				input.photoIds,
				toLayoutPhotos(data.photos),
				await data.preset(),
				seed
			);
			// A split row's first slide is one tile of the panorama: only layouts that keep it.
			layouts = isSplitRow(data.project)
				? options.filter((c) => !tileChanged(input.tile, c.backgrounds[0]))
				: options;
		} catch (e) {
			console.error(e);
			toast.error('Couldn’t make layouts');
		} finally {
			loading = false;
		}
	}

	function more() {
		seed += 1;
		void generate();
	}

	async function apply() {
		const chosen = choosing;
		choosing = null;
		const project = data.project;
		if (!chosen || !project?.carousels || locked) return;
		const carousels = $state.snapshot(project.carousels) as [Carousel, Carousel, Carousel];
		carousels[index] = $state.snapshot(chosen) as Carousel;
		data.project = await saveProject({ ...$state.snapshot(project), carousels });
		await goto(`/p/${project.id}/c/${index + 1}`);
	}

	const locked = $derived(isLocked(data.project, index));
	const hasTile = $derived(!!data.project?.carousels?.[index]?.backgrounds[0]?.photoId);
</script>

<AppHeader
	title="Layouts · {TILE_NAMES[index]} tile"
	backHref="/p/{page.params.id}/c/{index + 1}"
	backLabel="Editor"
/>

<main class="mx-auto flex max-w-xl flex-col gap-4 pt-4 pb-28">
	{#if data.analysing}
		<div class="flex flex-col gap-1.5 px-4" aria-live="polite">
			<Progress value={(data.analysing.done / data.analysing.total) * 100} />
			<p class="text-xs text-muted-foreground">
				Analysing photos… {data.analysing.done} of {data.analysing.total}
			</p>
		</div>
	{/if}

	{#if data.loaded && locked}
		<p class="px-4 text-sm text-muted-foreground">
			This carousel is locked. Turn off Locked in the editor to try other layouts.
		</p>
	{:else if data.loaded && !hasTile}
		<p class="px-4 text-sm text-muted-foreground">
			Choose this carousel’s grid tile photo first; layouts are built around it.
		</p>
	{:else if loading && !layouts.length}
		<p class="px-4 text-sm text-muted-foreground">Building layouts…</p>
	{:else}
		<p class="px-4 text-xs text-muted-foreground">
			Same grid tile and photos, arranged differently. Tap one to use it (replaces the current
			layout).
		</p>
		{#each layouts as layout, i (i)}
			<button
				type="button"
				class="flex flex-col gap-1.5 py-1 text-left hover:bg-accent/40 {loading
					? 'opacity-50'
					: ''}"
				onclick={() => (choosing = layout)}
				aria-label="Layout {i + 1}, {layout.slideCount} slides, {layout.frames
					.length} framed photos"
			>
				<span class="px-4 text-xs text-muted-foreground">
					{layout.slideCount} slides · {layout.frames.length} framed
				</span>
				<span class="block px-4"
					><CarouselStrip
						carousel={layout}
						{sources}
						slideWidth={84}
						emptyFill={data.emptyFill}
					/></span
				>
			</button>
		{/each}
	{/if}
</main>

<div
	class="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div class="mx-auto flex max-w-xl gap-2 p-3">
		<Button
			variant="outline"
			class="flex-1"
			disabled={loading || !hasTile || locked}
			onclick={more}
		>
			<RefreshCwIcon /> More layouts
		</Button>
	</div>
</div>

<AlertDialog.Root open={choosing !== null} onOpenChange={(o) => !o && (choosing = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Use this layout?</AlertDialog.Title>
			<AlertDialog.Description
				>It replaces the carousel’s current layout and edits.</AlertDialog.Description
			>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={apply}>Use layout</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
