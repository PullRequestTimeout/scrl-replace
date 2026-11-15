<script lang="ts">
	import type { Carousel } from '#lib/model/layout.ts';
	import type { PhotoId } from '#lib/model/types.ts';
	import type { DrawSource } from '#lib/render/draw.ts';
	import SlideCanvas from './SlideCanvas.svelte';

	interface Props {
		carousel: Carousel;
		sources: Map<PhotoId, DrawSource>;
		/** Width of each slide in CSS px. */
		slideWidth?: number;
		emptyFill?: string;
	}

	let { carousel, sources, slideWidth = 96, emptyFill }: Props = $props();
</script>

<!-- The whole strip, slides edge to edge, with hairlines where Instagram cuts between slides. -->
<div class="[scrollbar-width:none] overflow-x-auto overscroll-x-contain">
	<div class="flex w-max">
		{#each { length: carousel.slideCount }, slide (slide)}
			<div class="relative shrink-0" style="width: {slideWidth}px">
				<SlideCanvas {carousel} {sources} {slide} {emptyFill} />
				{#if slide > 0}
					<div class="pointer-events-none absolute inset-y-0 left-0 w-px bg-black/60"></div>
				{/if}
			</div>
		{/each}
	</div>
</div>
