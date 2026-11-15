<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PinOffIcon from '@lucide/svelte/icons/pin-off';
	import ReplaceIcon from '@lucide/svelte/icons/replace';
	import MoveVerticalIcon from '@lucide/svelte/icons/move-vertical';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import GridRowPreview from '#lib/components/app/GridRowPreview.svelte';
	import StoredImage from '#lib/components/app/StoredImage.svelte';
	import PhotoTray from '#lib/components/editor/PhotoTray.svelte';
	import { ProjectData } from '#lib/stores/project-data.svelte.ts';
	import { loadPreviewSources } from '#lib/render/preview-cache.ts';
	import type { DrawSource } from '#lib/render/draw.ts';
	import { imageWorker } from '#lib/workers/client.ts';
	import { toLayoutPhotos } from '#lib/layout/types.ts';
	import type { Pins, RowMode, RowOption } from '#lib/layout/row.ts';
	import { rowPhotos, rowTiles, type GridRow } from '#lib/model/row.ts';
	import type { Carousel } from '#lib/model/layout.ts';
	import type { Photo, PhotoId } from '#lib/model/types.ts';
	import { saveProject } from '#lib/storage/projects.ts';
	import { panCrop } from '#lib/editor/crop-gesture.ts';
	import { SLIDE_H, SPLIT_SOURCE_W } from '#lib/model/constants.ts';
	import { TILE_NAMES } from '#lib/export/share.ts';

	const data = new ProjectData(page.params.id ?? '');
	let sources = $state(new Map<PhotoId, DrawSource>());
	let options = $state<RowOption[]>([]);
	let current = $state(0);
	let mode = $state<RowMode>('any');
	let pins = $state<Pins>([null, null, null]);
	let loading = $state(true);
	let working = $state(false);
	let adjusting = $state(false);
	let trayFor = $state<number | null>(null);
	let trayOpen = $state(false);
	let confirmReplace = $state(false);
	let scroller = $state<HTMLDivElement>();

	const photoMap = $derived(new Map(data.photos.map((p) => [p.id, p])));
	const sizeOf = (id: PhotoId) => photoMap.get(id)!;

	$effect(() => {
		void (async () => {
			await data.load();
			if (data.project?.pinnedTiles) pins = [...data.project.pinnedTiles] as Pins;
			sources = await loadPreviewSources(data.photos);
			await data.ensureAnalysis();
			await refresh();
		})();
	});

	async function refresh() {
		loading = true;
		try {
			const result = await imageWorker().suggestRows(toLayoutPhotos(data.photos), {
				pins: $state.snapshot(pins) as Pins,
				mode,
				count: 5
			});
			options = result;
			current = 0;
			scroller?.scrollTo({ left: 0 });
		} catch (e) {
			console.error(e);
			toast.error('Couldn’t make suggestions');
		} finally {
			loading = false;
		}
	}

	/** Three single-slide carousels showing each option's tiles. */
	function previewOf(row: GridRow): [Carousel, Carousel, Carousel] {
		return rowTiles(row, sizeOf).map((tile): Carousel => ({
			slideCount: 1,
			backgrounds: [tile],
			frames: []
		})) as [Carousel, Carousel, Carousel];
	}

	const selected = $derived(options[current]?.row ?? null);
	const tilePhotoIds = $derived(
		selected
			? selected.mode === 'split'
				? [selected.photoId, selected.photoId, selected.photoId]
				: selected.tiles
			: []
	);

	function onScroll() {
		if (scroller)
			current = Math.min(
				options.length - 1,
				Math.round(scroller.scrollLeft / scroller.clientWidth)
			);
	}

	function setMode(m: RowMode) {
		mode = m;
		void refresh();
	}

	function togglePin(i: number) {
		const next = [...pins] as Pins;
		next[i] = next[i] ? null : (tilePhotoIds[i] ?? null);
		pins = next;
		void refresh();
	}

	function changeTile(i: number) {
		trayFor = i;
		trayOpen = true;
	}

	function pickTile(photo: Photo) {
		trayOpen = false;
		if (trayFor === null) return;
		const next = [...pins] as Pins;
		next[trayFor] = photo.id;
		pins = next;
		if (mode === 'split') mode = 'any';
		void refresh();
	}

	// Split rows: drag up/down (or sideways when zoomed) to move the panorama crop.
	let drag: {
		x: number;
		y: number;
		crop: { fx: number; fy: number; zoom: number };
		scale: number;
	} | null = null;
	function onAdjustDown(e: PointerEvent) {
		if (!adjusting || selected?.mode !== 'split') return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		const width = (e.currentTarget as HTMLElement).clientWidth;
		drag = {
			x: e.clientX,
			y: e.clientY,
			crop: { ...selected.crop },
			scale: width / SPLIT_SOURCE_W
		};
	}
	function onAdjustMove(e: PointerEvent) {
		if (!drag || selected?.mode !== 'split') return;
		const p = photoMap.get(selected.photoId);
		if (!p) return;
		const crop = panCrop(
			p.width,
			p.height,
			SPLIT_SOURCE_W,
			SLIDE_H,
			drag.crop,
			(e.clientX - drag.x) / drag.scale,
			(e.clientY - drag.y) / drag.scale
		);
		options[current] = { ...options[current], row: { ...selected, crop } };
	}
	function onAdjustUp() {
		drag = null;
	}

	async function useRow() {
		if (!selected || !data.project) return;
		if (data.project.carousels && !confirmReplace) {
			confirmReplace = true;
			return;
		}
		confirmReplace = false;
		working = true;
		try {
			const row = $state.snapshot(selected) as GridRow;
			const plan = await imageWorker().planCarousels(
				row,
				toLayoutPhotos(data.photos),
				Date.now() % 100_000
			);
			const carousels = plan.suggestions.map((s) => s[0]) as [Carousel, Carousel, Carousel];
			if (carousels.some((c) => !c)) throw new Error('No layout fitted these photos');
			data.project = await saveProject({
				...$state.snapshot(data.project),
				row,
				assignment: plan.assignment,
				pinnedTiles: $state.snapshot(pins) as Pins,
				carousels
			});
			await goto(`/p/${data.project.id}`);
		} catch (e) {
			console.error(e);
			toast.error(e instanceof Error ? e.message : 'Couldn’t build the carousels');
		} finally {
			working = false;
		}
	}

	const MODES: [RowMode, string][] = [
		['any', 'Any'],
		['split', 'Split'],
		['matched', 'Matched']
	];
</script>

<AppHeader title="Grid row" backHref="/p/{page.params.id}" backLabel="Project" />

<main class="mx-auto flex max-w-xl flex-col gap-4 pt-4 pb-28">
	{#if data.analysing}
		<div class="flex flex-col gap-1.5 px-4" aria-live="polite">
			<Progress value={(data.analysing.done / data.analysing.total) * 100} />
			<p class="text-xs text-muted-foreground">
				Analysing photos… {data.analysing.done} of {data.analysing.total}
			</p>
		</div>
	{/if}

	<div class="flex items-center justify-between px-4">
		<div class="flex rounded-md border p-0.5 text-xs" role="radiogroup" aria-label="Row type">
			{#each MODES as [value, label] (value)}
				<button
					type="button"
					role="radio"
					aria-checked={mode === value}
					class="rounded px-2.5 py-1 {mode === value
						? 'bg-secondary text-foreground'
						: 'text-muted-foreground'}"
					onclick={() => setMode(value)}>{label}</button
				>
			{/each}
		</div>
		{#if options.length}
			<span class="text-xs text-muted-foreground tabular-nums"
				>{current + 1} of {options.length}</span
			>
		{/if}
	</div>

	{#if loading && !options.length}
		<p class="px-4 text-sm text-muted-foreground">Finding rows…</p>
	{:else if !options.length}
		<p class="px-4 text-sm text-muted-foreground">
			{mode === 'split'
				? 'No photo is wide and large enough to cut across all three tiles.'
				: 'Add at least three photos to get suggestions.'}
		</p>
	{:else}
		<div
			bind:this={scroller}
			onscroll={onScroll}
			class="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain {adjusting
				? 'overflow-x-hidden'
				: ''}"
			aria-label="Row options"
		>
			{#each options as option, i (i)}
				<div class="flex w-full shrink-0 snap-center flex-col gap-2">
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class={adjusting && i === current ? 'touch-none ring-2 ring-amber-500' : ''}
						onpointerdown={onAdjustDown}
						onpointermove={onAdjustMove}
						onpointerup={onAdjustUp}
						onpointercancel={onAdjustUp}
					>
						<GridRowPreview carousels={previewOf(option.row)} {sources} />
					</div>
					<p class="px-4 text-xs text-muted-foreground">
						{option.row.mode === 'split'
							? 'One photo across all three tiles'
							: 'Three matched photos'}
					</p>
				</div>
			{/each}
		</div>

		{#if selected}
			<div class="grid grid-cols-3 gap-2 px-4">
				{#each [0, 1, 2] as i (i)}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class="flex items-center gap-2 rounded-md border p-1.5 text-left text-xs {pins[i]
								? 'border-amber-500/70'
								: ''}"
							aria-label="{TILE_NAMES[i]} tile options{pins[i] ? ', pinned' : ''}"
						>
							{#if tilePhotoIds[i]}
								<StoredImage
									photoId={tilePhotoIds[i]}
									class="size-8 shrink-0 rounded object-cover"
								/>
							{/if}
							<span class="min-w-0 flex-1 truncate capitalize">{TILE_NAMES[i]}</span>
							{#if pins[i]}<PinIcon
									class="size-3.5 shrink-0 text-amber-500"
									aria-hidden="true"
								/>{/if}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content>
							<DropdownMenu.Item onclick={() => togglePin(i)}>
								{#if pins[i]}<PinOffIcon /> Unpin{:else}<PinIcon /> Pin this tile{/if}
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => changeTile(i)}
								><ReplaceIcon /> Choose photo…</DropdownMenu.Item
							>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/each}
			</div>
			<p class="px-4 text-xs text-muted-foreground">
				Pin a tile to keep it; the others are re-suggested to match.
			</p>
			{#if selected.mode === 'split'}
				<div class="px-4">
					<Button
						variant={adjusting ? 'secondary' : 'outline'}
						size="sm"
						onclick={() => (adjusting = !adjusting)}
						aria-pressed={adjusting}
					>
						<MoveVerticalIcon />
						{adjusting ? 'Done adjusting' : 'Adjust crop'}
					</Button>
				</div>
			{/if}
		{/if}
	{/if}
</main>

<div
	class="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div class="mx-auto flex max-w-xl gap-2 p-3">
		<Button class="flex-1" disabled={!selected || working || loading} onclick={useRow}>
			{working ? 'Building carousels…' : 'Use this row'}
		</Button>
	</div>
</div>

<PhotoTray
	bind:open={trayOpen}
	title="Choose the {trayFor === null ? '' : TILE_NAMES[trayFor]} tile"
	description="Portrait photos fit a grid tile best."
	photos={[...data.photos].sort(
		(a, b) => (a.height > a.width ? 0 : 1) - (b.height > b.width ? 0 : 1)
	)}
	usage={new Map(selected ? rowPhotos(selected).map((id) => [id, 'In row']) : [])}
	onPick={pickTile}
/>

<AlertDialog.Root bind:open={confirmReplace}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Replace the current carousels?</AlertDialog.Title>
			<AlertDialog.Description>
				New layouts are built around this row. Edits to the existing carousels are lost.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={useRow}>Replace</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
