<script lang="ts">
	import { SLIDE_H, SLIDE_W } from '#lib/model/constants.ts';
	import type { Carousel } from '#lib/model/layout.ts';
	import type { PhotoId } from '#lib/model/types.ts';
	import { drawCarousel, type DrawSource } from '#lib/render/draw.ts';
	import { cn } from '#lib/utils.js';

	interface Props {
		carousel: Carousel;
		sources: Map<PhotoId, DrawSource>;
		slide: number;
		class?: string;
		label?: string;
		emptyFill?: string;
	}

	let { carousel, sources, slide, class: className, label, emptyFill }: Props = $props();

	let canvas = $state<HTMLCanvasElement>();
	let cssWidth = $state(0);

	// Cap device pixel ratio at 2: plenty for a preview, and keeps many canvases cheap on iOS.
	const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);

	$effect(() => {
		if (!canvas || cssWidth <= 0) return;
		const width = Math.round(cssWidth * dpr);
		const height = Math.round((width * SLIDE_H) / SLIDE_W);
		if (canvas.width !== width) canvas.width = width;
		if (canvas.height !== height) canvas.height = height;
		const ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) return;
		drawCarousel(ctx, carousel, (id) => sources.get(id), {
			originX: slide * SLIDE_W,
			scale: width / SLIDE_W,
			emptyFill
		});
	});
</script>

<div
	class={cn('relative aspect-[4/5] w-full', className)}
	bind:clientWidth={cssWidth}
	role="img"
	aria-label={label ?? `Slide ${slide + 1} of ${carousel.slideCount}`}
>
	<canvas bind:this={canvas} class="absolute inset-0 h-full w-full"></canvas>
</div>
