<script lang="ts">
	import { onDestroy } from 'svelte';
	import ImagePlusIcon from '@lucide/svelte/icons/image-plus';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import { imageWorker } from '#lib/workers/client.ts';
	import { canShareFiles, downloadFiles, shareFiles } from '#lib/export/share.ts';

	interface Result {
		files: File[];
		urls: string[];
		p3Supported: boolean;
	}

	let fileInput = $state<HTMLInputElement>();
	let working = $state(false);
	let result = $state<Result | null>(null);

	function clear() {
		for (const u of result?.urls ?? []) URL.revokeObjectURL(u);
		result = null;
	}

	async function onFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		clear();
		working = true;
		try {
			const { srgb, p3, p3Supported } = await imageWorker().colourTest(file);
			const files = [
				new File([srgb], 'colour-test-A-srgb.jpg', { type: 'image/jpeg' }),
				new File([p3], 'colour-test-B-p3.jpg', { type: 'image/jpeg' })
			];
			result = { files, urls: files.map((f) => URL.createObjectURL(f)), p3Supported };
		} catch (e) {
			console.error(e);
			toast.error('Couldn’t read that photo');
		} finally {
			working = false;
		}
	}

	function save() {
		if (!result) return;
		if (canShareFiles(result.files)) void shareFiles(result.files);
		else void downloadFiles(result.files);
	}

	onDestroy(clear);
</script>

<AppHeader title="Colour test" backHref="/settings" backLabel="Settings" />

<input
	bind:this={fileInput}
	type="file"
	accept="image/*"
	class="sr-only"
	tabindex="-1"
	aria-hidden="true"
	onchange={onFile}
/>

<main class="mx-auto flex max-w-xl flex-col gap-4 p-4 text-sm">
	<ol class="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
		<li>Pick a colourful photo, ideally one with saturated reds, oranges or greens.</li>
		<li>
			Save both versions (A = sRGB, B = Display P3) and post them as one carousel to a private or
			close-friends test.
		</li>
		<li>
			Compare each against the photo in your Photos app, then pick the matching colour space in
			Settings.
		</li>
	</ol>

	<Button variant="outline" disabled={working} onclick={() => fileInput?.click()}>
		<ImagePlusIcon />
		{working ? 'Rendering…' : 'Pick a photo'}
	</Button>

	{#if result}
		{#if !result.p3Supported}
			<p class="rounded-lg border p-3 text-muted-foreground">
				This browser doesn’t support Display P3 canvases, so B is the same as A. Stick with sRGB.
			</p>
		{/if}
		<div class="grid grid-cols-2 gap-2">
			{#each result.urls as url, i (url)}
				<figure class="flex flex-col gap-1">
					<img
						src={url}
						alt="Version {i === 0 ? 'A, sRGB' : 'B, Display P3'}"
						class="aspect-[4/5] w-full rounded object-cover"
					/>
					<figcaption class="text-center text-xs text-muted-foreground">
						{i === 0 ? 'A · sRGB' : 'B · Display P3'}
					</figcaption>
				</figure>
			{/each}
		</div>
		<Button onclick={save}>Save both to Photos</Button>
	{/if}
</main>
