<script lang="ts">
	import * as Drawer from '#lib/components/ui/drawer/index.js';
	import StoredImage from '#lib/components/app/StoredImage.svelte';
	import type { Photo, PhotoId } from '#lib/model/types.ts';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		photos: Photo[];
		/** Short label for photos already used, e.g. "Here" or "Carousel 2". */
		usage: Map<PhotoId, string>;
		onPick: (photo: Photo) => void;
	}

	let { open = $bindable(false), title, description, photos, usage, onPick }: Props = $props();
</script>

<Drawer.Root bind:open>
	<Drawer.Content class="max-h-[85dvh]">
		<Drawer.Header>
			<Drawer.Title>{title}</Drawer.Title>
			<Drawer.Description>
				{description ?? `${photos.length} photos in this project`}
			</Drawer.Description>
		</Drawer.Header>
		<ul
			class="grid grid-cols-4 gap-0.5 overflow-y-auto px-0.5 pb-[max(1rem,env(safe-area-inset-bottom))]"
		>
			{#each photos as photo (photo.id)}
				{@const used = usage.get(photo.id)}
				<li class="relative aspect-square">
					<button
						type="button"
						class="block h-full w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-ring"
						onclick={() => onPick(photo)}
						aria-label="{photo.name}{used ? `, used in ${used}` : ''}"
					>
						<StoredImage
							photoId={photo.id}
							class="h-full w-full object-cover {used ? 'opacity-60' : ''}"
						/>
					</button>
					{#if used}
						<span
							class="pointer-events-none absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white"
						>
							{used}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	</Drawer.Content>
</Drawer.Root>
