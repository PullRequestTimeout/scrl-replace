<script lang="ts">
	import { GRID_VISIBLE_W, SLIDE_W } from '#lib/model/constants.ts';
	import type { Carousel } from '#lib/model/layout.ts';
	import type { PhotoId } from '#lib/model/types.ts';
	import type { DrawSource } from '#lib/render/draw.ts';
	import SlideCanvas from './SlideCanvas.svelte';

	interface Props {
		carousels: [Carousel, Carousel, Carousel];
		sources: Map<PhotoId, DrawSource>;
		/** 'grid' shows the 3:4 crop the profile grid uses; 'full' shows the whole 4:5 first slides. */
		mode?: 'grid' | 'full';
	}

	let { carousels, sources, mode = 'grid' }: Props = $props();

	// In grid mode each tile shows the centre 1012.5 of 1080px, so the canvas is wider than its box.
	const overscan = (SLIDE_W / GRID_VISIBLE_W) * 100;
	const sides = ['left', 'middle', 'right'];
</script>

<div class="grid grid-cols-3 gap-0.5 bg-black">
	{#each carousels as carousel, i (i)}
		<div class="relative overflow-hidden {mode === 'grid' ? 'aspect-[3/4]' : 'aspect-[4/5]'}">
			{#if mode === 'grid'}
				<div class="absolute inset-y-0 left-1/2 -translate-x-1/2" style="width: {overscan}%">
					<SlideCanvas {carousel} {sources} slide={0} label="Grid tile, {sides[i]}" />
				</div>
			{:else}
				<SlideCanvas {carousel} {sources} slide={0} label="First slide, {sides[i]}" />
			{/if}
		</div>
	{/each}
</div>
