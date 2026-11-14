<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import CarouselStrip from '#lib/components/app/CarouselStrip.svelte';
	import SlideCanvas from '#lib/components/app/SlideCanvas.svelte';
	import { ProjectData } from '#lib/stores/project-data.svelte.ts';
	import { loadPreviewSources } from '#lib/render/preview-cache.ts';
	import type { DrawSource } from '#lib/render/draw.ts';
	import { photosIn } from '#lib/model/layout.ts';
	import { TILE_NAMES } from '#lib/export/share.ts';

	const index = $derived(Math.max(0, Math.min(2, Number(page.params.n ?? '1') - 1)));
	const data = new ProjectData(page.params.id ?? '');
	let sources = $state(new Map<string, DrawSource>());
	let current = $state(0);
	let scroller = $state<HTMLDivElement>();

	$effect(() => {
		void (async () => {
			await data.load();
			const carousel = data.project?.carousels?.[index];
			if (!carousel) return;
			const ids = new Set(photosIn(carousel));
			sources = await loadPreviewSources(data.photos.filter((p) => ids.has(p.id)));
		})();
	});

	const carousel = $derived(data.project?.carousels?.[index] ?? null);

	function onScroll() {
		if (!scroller) return;
		current = Math.round(scroller.scrollLeft / scroller.clientWidth);
	}
</script>

<AppHeader
	title="Carousel {index + 1} · {TILE_NAMES[index]} tile"
	backHref="/p/{page.params.id}"
	backLabel="Project"
/>

<main class="mx-auto flex max-w-xl flex-col gap-4 py-4">
	{#if carousel}
		<!-- Swipe through slides as they'll appear on Instagram. -->
		<div
			bind:this={scroller}
			onscroll={onScroll}
			class="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain"
			aria-label="Slides"
		>
			{#each { length: carousel.slideCount }, slide (slide)}
				<div class="w-full shrink-0 snap-center">
					<SlideCanvas {carousel} {sources} {slide} />
				</div>
			{/each}
		</div>
		<div class="flex justify-center gap-1.5" aria-hidden="true">
			{#each { length: carousel.slideCount }, slide (slide)}
				<span class="size-1.5 rounded-full {slide === current ? 'bg-foreground' : 'bg-muted'}"
				></span>
			{/each}
		</div>
		<p class="text-center text-xs text-muted-foreground" aria-live="polite">
			Slide {current + 1} of {carousel.slideCount}
		</p>

		<section class="flex flex-col gap-2 px-4">
			<h2 class="text-sm font-medium">Whole strip</h2>
			<CarouselStrip {carousel} {sources} slideWidth={72} />
			<p class="text-xs text-muted-foreground">Editing arrives in Phase 3.</p>
		</section>
	{:else if data.loaded}
		<p class="p-6 text-sm text-muted-foreground">This carousel doesn’t exist yet.</p>
	{/if}
</main>
