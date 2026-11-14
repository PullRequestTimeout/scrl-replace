<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy } from 'svelte';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import ShareIcon from '@lucide/svelte/icons/share';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import { ProjectData } from '#lib/stores/project-data.svelte.ts';
	import { imageWorker } from '#lib/workers/client.ts';
	import { isComplete, photosIn } from '#lib/model/layout.ts';
	import { getColorSpace } from '#lib/settings.ts';
	import { saveProject } from '#lib/storage/projects.ts';
	import {
		POSTING_ORDER,
		TILE_NAMES,
		canShareFiles,
		downloadFiles,
		shareFiles,
		slideFileName
	} from '#lib/export/share.ts';

	interface Rendered {
		carouselIndex: number;
		postNumber: number;
		files: File[];
		urls: string[];
	}

	const data = new ProjectData(page.params.id ?? '');
	let rendered = $state<Rendered[]>([]);
	let rendering = $state(true);
	let done = $state(0);
	let total = $state(0);
	let error = $state<string | null>(null);
	let canShare = $state(false);

	$effect(() => {
		void render();
	});

	async function render() {
		await data.load();
		const carousels = data.project?.carousels;
		if (!carousels) {
			rendering = false;
			return;
		}
		const colorSpace = getColorSpace();
		total = carousels.reduce((n, c) => n + c.slideCount, 0);
		try {
			// Render in posting order so the first post is ready first.
			for (const [postIndex, carouselIndex] of POSTING_ORDER.entries()) {
				const carousel = $state.snapshot(carousels[carouselIndex]);
				const ids = new Set(photosIn(carousel));
				const sizes = data.photos
					.filter((p) => ids.has(p.id))
					.map((p) => ({ id: p.id, width: p.width, height: p.height }));
				const blobs = await imageWorker().renderCarousel(carousel, sizes, colorSpace);
				const postNumber = postIndex + 1;
				const files = blobs.map(
					(b, slide) => new File([b], slideFileName(postNumber, slide), { type: 'image/jpeg' })
				);
				rendered.push({
					carouselIndex,
					postNumber,
					files,
					urls: files.map((f) => URL.createObjectURL(f))
				});
				done += carousel.slideCount;
			}
			canShare = canShareFiles(rendered[0]?.files ?? []);
		} catch (e) {
			console.error(e);
			error = e instanceof Error ? e.message : String(e);
		} finally {
			rendering = false;
		}
	}

	onDestroy(() => {
		for (const r of rendered) for (const u of r.urls) URL.revokeObjectURL(u);
	});

	// Must stay synchronous up to navigator.share: iOS rejects shares after an await.
	function save(item: Rendered) {
		if (!canShare) {
			void downloadFiles(item.files);
			return;
		}
		void shareFiles(item.files).then((result) => {
			if (result === 'failed') toast.error('Couldn’t open the share sheet');
		});
	}

	async function togglePosted(item: Rendered) {
		if (!data.project) return;
		const posted = [...data.project.exportState.posted] as [boolean, boolean, boolean];
		posted[item.carouselIndex] = !posted[item.carouselIndex];
		data.project = await saveProject({ ...data.project, exportState: { posted } });
	}
</script>

<AppHeader title="Export" backHref="/p/{page.params.id}" backLabel="Project" />

<main class="mx-auto flex max-w-xl flex-col gap-4 p-4">
	{#if rendering}
		<div class="flex flex-col gap-1.5" aria-live="polite">
			<Progress value={total ? (done / total) * 100 : 0} />
			<p class="text-xs text-muted-foreground">Rendering slides… {done} of {total}</p>
		</div>
	{/if}

	{#if error}
		<p class="rounded-lg border border-destructive/50 p-3 text-sm text-destructive">
			Export failed: {error}
		</p>
	{/if}

	{#if !rendering && !data.project?.carousels}
		<p class="text-sm text-muted-foreground">Nothing to export yet.</p>
	{/if}

	{#if rendered.length}
		<p class="text-sm text-muted-foreground">
			Post in this order so the row lands correctly on your grid (newest posts appear top-left).
			{#if canShare}Each button opens the share sheet: choose <span class="text-foreground"
					>Save N Images</span
				>.{/if}
		</p>
	{/if}

	{#each rendered as item (item.carouselIndex)}
		{@const posted = data.project?.exportState.posted[item.carouselIndex] ?? false}
		<section class="flex flex-col gap-3 rounded-lg border bg-card p-3">
			<div class="flex items-baseline justify-between">
				<h2 class="font-medium">
					Post {item.postNumber}
					<span class="text-muted-foreground">· {TILE_NAMES[item.carouselIndex]} tile</span>
				</h2>
				<span class="text-xs text-muted-foreground">{item.files.length} slides</span>
			</div>
			{#if data.project?.carousels && !isComplete(data.project.carousels[item.carouselIndex])}
				<p class="text-xs text-amber-500">
					This carousel still has empty backgrounds; they export as grey.
				</p>
			{/if}
			<div class="flex [scrollbar-width:none] gap-1 overflow-x-auto">
				{#each item.urls as url, slide (url)}
					<img
						src={url}
						alt="Post {item.postNumber}, slide {slide + 1}"
						class="aspect-[4/5] w-16 shrink-0 rounded-sm object-cover"
					/>
				{/each}
			</div>
			<div class="flex gap-2">
				<Button class="flex-1" onclick={() => save(item)}>
					{#if canShare}<ShareIcon /> Save to Photos{:else}<DownloadIcon /> Download{/if}
				</Button>
				<Button
					variant={posted ? 'secondary' : 'outline'}
					onclick={() => togglePosted(item)}
					aria-pressed={posted}
				>
					{#if posted}<CheckIcon /> Posted{:else}Mark posted{/if}
				</Button>
			</div>
		</section>
	{/each}
</main>
