<script lang="ts">
	import { page } from '$app/state';
	import ImagePlusIcon from '@lucide/svelte/icons/image-plus';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { toast } from 'svelte-sonner';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as Drawer from '#lib/components/ui/drawer/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import StoredImage from '#lib/components/app/StoredImage.svelte';
	import { Importer } from '#lib/import/importer.svelte.ts';
	import { canBeSplitRow, orientationOf } from '#lib/images/geometry.ts';
	import { revokeImageUrls } from '#lib/images/object-urls.ts';
	import type { Photo, Project } from '#lib/model/types.ts';
	import { getPhotos, getProject, removePhotoFromProject } from '#lib/storage/projects.ts';

	const projectId = $derived(page.params.id ?? '');

	let project = $state<Project | null>(null);
	let photos = $state<Photo[]>([]);
	let missing = $state(false);
	let selected = $state<Photo | null>(null);
	let fileInput = $state<HTMLInputElement>();

	$effect(() => {
		const id = projectId;
		void (async () => {
			const loaded = await getProject(id);
			if (!loaded) {
				missing = true;
				return;
			}
			project = loaded;
			photos = await getPhotos(loaded.photoIds);
		})();
	});

	// Created once per page: the importer keeps running if the list re-renders.
	const importer = $derived(
		new Importer(
			projectId,
			() => photos.length,
			(photo) => {
				photos.push(photo);
			}
		)
	);

	function onFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (input.files?.length) importer.add(input.files);
		input.value = ''; // allow picking the same files again
	}

	$effect(() => {
		if (!importer.running && importer.failures.length) {
			toast.error(`${importer.failures.length} photo(s) couldn’t be imported`, {
				description: importer.failures.map((f) => f.name).join(', ')
			});
		}
	});

	async function remove(photo: Photo) {
		selected = null;
		await removePhotoFromProject(projectId, photo.id);
		revokeImageUrls(photo.id);
		photos = photos.filter((p) => p.id !== photo.id);
	}

	const missingDates = $derived(photos.filter((p) => p.capturedAt === undefined).length);
	const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const megapixels = (p: Photo) => ((p.width * p.height) / 1e6).toFixed(1);
</script>

<AppHeader title={project?.name ?? 'Project'} backHref="/p/{projectId}" backLabel="Project" />

<input
	bind:this={fileInput}
	type="file"
	accept="image/*"
	multiple
	class="sr-only"
	tabindex="-1"
	aria-hidden="true"
	onchange={onFiles}
/>

<main class="mx-auto max-w-xl pb-28">
	{#if missing}
		<p class="p-6 text-sm text-muted-foreground">
			This project no longer exists. <a class="underline" href="/">Back to projects</a>
		</p>
	{:else}
		<section class="flex flex-col gap-3 p-4">
			<div class="flex items-baseline justify-between">
				<h2 class="text-sm font-medium">
					{photos.length} photo{photos.length === 1 ? '' : 's'}
				</h2>
				<p class="text-xs text-muted-foreground">Aim for 10–25 edited picks</p>
			</div>

			{#if importer.running}
				<div class="flex flex-col gap-1.5" aria-live="polite">
					<Progress value={importer.progress * 100} />
					<p class="truncate text-xs text-muted-foreground">
						Importing {importer.done + 1} of {importer.total}: {importer.current}
					</p>
				</div>
			{/if}
		</section>

		{#if photos.length === 0 && !importer.running}
			<div class="flex flex-col items-center gap-3 px-6 pt-10 text-center">
				<ImagePlusIcon class="size-10 text-muted-foreground" aria-hidden="true" />
				<p class="max-w-xs text-sm text-muted-foreground">
					Pick finished edits from your camera roll. They’re resized and stored on this device only.
				</p>
			</div>
		{:else}
			<ul class="grid grid-cols-3 gap-0.5 px-0.5 sm:grid-cols-4">
				{#each photos as photo (photo.id)}
					<li class="relative aspect-square">
						<button
							type="button"
							class="block h-full w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-ring"
							onclick={() => (selected = photo)}
							aria-label="{photo.name}, {orientationOf(photo)}"
						>
							<StoredImage photoId={photo.id} class="h-full w-full object-cover" />
						</button>
						{#if orientationOf(photo) === 'landscape' && !canBeSplitRow(photo)}
							<Badge
								variant="secondary"
								class="pointer-events-none absolute bottom-1 left-1 text-[10px]"
							>
								Low res
							</Badge>
						{/if}
					</li>
				{/each}
			</ul>
			{#if missingDates > 0}
				<p class="px-4 pt-3 text-xs text-muted-foreground">
					{missingDates} photo{missingDates === 1 ? ' has' : 's have'} no capture date. That’s fine: ordering
					works without it.
				</p>
			{/if}
		{/if}
	{/if}
</main>

{#if !missing}
	<div
		class="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur"
		style="padding-bottom: env(safe-area-inset-bottom)"
	>
		<div class="mx-auto flex max-w-xl gap-2 p-3">
			<Button variant="outline" class="flex-1" onclick={() => fileInput?.click()}>
				<ImagePlusIcon /> Add photos
			</Button>
			<a
				href="/p/{projectId}"
				class={buttonVariants({ class: 'flex-1' })}
				aria-disabled={importer.running}
			>
				Done
			</a>
		</div>
	</div>
{/if}

<Drawer.Root open={selected !== null} onOpenChange={(open) => !open && (selected = null)}>
	<Drawer.Content>
		{#if selected}
			{@const photo = selected}
			<Drawer.Header>
				<Drawer.Title class="truncate">{photo.name}</Drawer.Title>
				<Drawer.Description>
					{photo.width}×{photo.height} · {megapixels(photo)} MP ·
					{photo.capturedAt ? dateTime.format(photo.capturedAt) : 'No capture date'}
				</Drawer.Description>
			</Drawer.Header>
			<div class="flex justify-center px-4">
				<StoredImage
					photoId={photo.id}
					variant="preview"
					class="max-h-[55dvh] w-auto max-w-full rounded object-contain"
				/>
			</div>
			{#if orientationOf(photo) === 'landscape' && !canBeSplitRow(photo)}
				<p class="flex items-center gap-2 px-4 pt-3 text-xs text-muted-foreground">
					<TriangleAlertIcon class="size-4" aria-hidden="true" />
					Too small to be cut across all three grid tiles.
				</p>
			{/if}
			<Drawer.Footer>
				<Button variant="destructive" onclick={() => remove(photo)}>Remove from project</Button>
				<Drawer.Close class="w-full">
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Close</Button>
					{/snippet}
				</Drawer.Close>
			</Drawer.Footer>
		{/if}
	</Drawer.Content>
</Drawer.Root>
