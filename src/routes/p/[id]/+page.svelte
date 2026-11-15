<script lang="ts">
	import { page } from '$app/state';
	import ImagesIcon from '@lucide/svelte/icons/images';
	import ShareIcon from '@lucide/svelte/icons/share';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import CarouselStrip from '#lib/components/app/CarouselStrip.svelte';
	import GridRowPreview from '#lib/components/app/GridRowPreview.svelte';
	import { ProjectData } from '#lib/stores/project-data.svelte.ts';
	import { loadPreviewSources } from '#lib/render/preview-cache.ts';
	import type { DrawSource } from '#lib/render/draw.ts';
	import { photosIn } from '#lib/model/layout.ts';
	import { TILE_NAMES } from '#lib/export/share.ts';
	import { blankCarousel } from '#lib/editor/ops.ts';
	import { saveProject } from '#lib/storage/projects.ts';
	import PencilRulerIcon from '@lucide/svelte/icons/pencil-ruler';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';

	const data = new ProjectData(page.params.id ?? '');
	let sources = $state(new Map<string, DrawSource>());
	let rowMode = $state<'grid' | 'full'>('grid');

	$effect(() => {
		void (async () => {
			await data.load();
			const carousels = data.project?.carousels;
			if (!carousels) return;
			const ids = new Set(carousels.flatMap(photosIn));
			sources = await loadPreviewSources(data.photos.filter((p) => ids.has(p.id)));
		})();
	});

	async function buildByHand() {
		if (!data.project) return;
		data.project = await saveProject({
			...$state.snapshot(data.project),
			carousels: [blankCarousel(), blankCarousel(), blankCarousel()]
		});
	}

	const project = $derived(data.project);
	const carousels = $derived(project?.carousels ?? null);
	const tileLabel = (i: number) =>
		`${TILE_NAMES[i][0].toUpperCase()}${TILE_NAMES[i].slice(1)} tile`;
</script>

<AppHeader title={project?.name ?? 'Project'} backHref="/" backLabel="Projects" />

<main class="mx-auto flex max-w-xl flex-col gap-6 pt-4 pb-28">
	{#if data.missing}
		<p class="p-6 text-sm text-muted-foreground">
			This project no longer exists. <a class="underline" href="/">Back to projects</a>
		</p>
	{:else if data.loaded && project}
		{#if carousels}
			<section class="flex flex-col gap-2">
				<div class="flex items-center justify-between px-4">
					<div class="flex items-center gap-2">
						<h2 class="text-sm font-medium">Grid row</h2>
						{#if project.kind !== 'reference' && data.photos.length >= 3}
							<a
								href="/p/{project.id}/row"
								class="text-xs text-muted-foreground underline underline-offset-4"
								>New suggestions</a
							>
						{/if}
					</div>
					<div class="flex rounded-md border p-0.5 text-xs" role="group" aria-label="Grid row view">
						<button
							type="button"
							class="rounded px-2 py-1 {rowMode === 'grid'
								? 'bg-secondary text-foreground'
								: 'text-muted-foreground'}"
							aria-pressed={rowMode === 'grid'}
							onclick={() => (rowMode = 'grid')}>Profile grid</button
						>
						<button
							type="button"
							class="rounded px-2 py-1 {rowMode === 'full'
								? 'bg-secondary text-foreground'
								: 'text-muted-foreground'}"
							aria-pressed={rowMode === 'full'}
							onclick={() => (rowMode = 'full')}>Full slides</button
						>
					</div>
				</div>
				<GridRowPreview {carousels} {sources} mode={rowMode} />
			</section>

			<section class="flex flex-col gap-3">
				<h2 class="px-4 text-sm font-medium">Carousels</h2>
				{#each carousels as carousel, i (i)}
					<a
						href="/p/{project.id}/c/{i + 1}"
						class="flex flex-col gap-2 rounded-lg py-1 hover:bg-accent/40"
						aria-label="Carousel {i + 1}, {TILE_NAMES[i]} tile, {carousel.slideCount} slides"
					>
						<div class="flex items-center justify-between px-4 text-xs text-muted-foreground">
							<span>
								<span class="font-medium text-foreground">{tileLabel(i)}</span> ·
								{carousel.slideCount} slides
							</span>
							<ChevronRightIcon class="size-4" aria-hidden="true" />
						</div>
						<div class="px-4">
							<CarouselStrip {carousel} {sources} slideWidth={88} />
						</div>
					</a>
				{/each}
			</section>
		{:else if project.kind === 'reference'}
			<section class="mx-4 flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
				<h2 class="font-medium">Import your SCRL originals</h2>
				<p class="text-muted-foreground">
					{data.referenceMissing.length} of 17 photos still needed. Import them from Photos and the three
					reference carousels build themselves.
				</p>
				<p class="text-xs break-words text-muted-foreground">
					Missing: {data.referenceMissing.map((p) => p.name).join(', ')}
				</p>
			</section>
		{:else}
			<section class="mx-4 flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm">
				<h2 class="font-medium">No carousels yet</h2>
				<p class="text-muted-foreground">
					{data.photos.length} photos imported. Get suggested grid rows and layouts, or lay out the three
					carousels yourself.
				</p>
				{#if data.photos.length >= 3}
					<a href="/p/{project.id}/row" class={buttonVariants({ class: 'mt-1' })}>
						<SparklesIcon /> Suggest layouts
					</a>
				{/if}
				<Button
					variant={data.photos.length >= 3 ? 'outline' : 'default'}
					disabled={data.photos.length === 0}
					onclick={buildByHand}
				>
					<PencilRulerIcon /> Build by hand
				</Button>
			</section>
		{/if}
	{/if}
</main>

{#if project}
	<div
		class="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur"
		style="padding-bottom: env(safe-area-inset-bottom)"
	>
		<div class="mx-auto flex max-w-xl gap-2 p-3">
			<a
				href="/p/{project.id}/import"
				class={buttonVariants({ variant: 'outline', class: 'flex-1' })}
			>
				<ImagesIcon /> Photos ({data.photos.length})
			</a>
			{#if carousels}
				<a href="/p/{project.id}/export" class={buttonVariants({ class: 'flex-1' })}>
					<ShareIcon /> Export
				</a>
			{:else}
				<Button class="flex-1" disabled><ShareIcon /> Export</Button>
			{/if}
		</div>
	</div>
{/if}
