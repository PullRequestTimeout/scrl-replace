<script lang="ts">
	import type { HTMLImgAttributes } from 'svelte/elements';
	import type { PhotoId } from '#lib/model/types.ts';
	import type { ImageVariant } from '#lib/model/constants.ts';
	import { imageUrl } from '#lib/images/object-urls.ts';
	import { cn } from '#lib/utils.js';

	interface Props extends Omit<HTMLImgAttributes, 'src'> {
		photoId: PhotoId;
		variant?: ImageVariant;
	}

	let { photoId, variant = 'thumb', class: className, alt = '', ...rest }: Props = $props();

	let src = $state<string>();

	$effect(() => {
		let cancelled = false;
		src = undefined;
		imageUrl(photoId, variant).then((url) => {
			if (!cancelled) src = url;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if src}
	<img {src} {alt} class={className} decoding="async" draggable="false" {...rest} />
{:else}
	<div class={cn('animate-pulse bg-muted', className)} aria-hidden="true"></div>
{/if}
