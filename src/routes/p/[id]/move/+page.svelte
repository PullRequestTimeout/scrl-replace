<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import ArrowRightLeftIcon from '@lucide/svelte/icons/arrow-right-left';
	import CircleSlashIcon from '@lucide/svelte/icons/circle-slash';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';
	import LockIcon from '@lucide/svelte/icons/lock';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import StoredImage from '#lib/components/app/StoredImage.svelte';
	import { ProjectData } from '#lib/stores/project-data.svelte.ts';
	import { imageWorker } from '#lib/workers/client.ts';
	import { toLayoutPhotos } from '#lib/layout/types.ts';
	import { rowPhotos } from '#lib/model/row.ts';
	import { photosIn, type Background, type Carousel } from '#lib/model/layout.ts';
	import type { PhotoId } from '#lib/model/types.ts';
	import { isLocked } from '#lib/model/locks.ts';
	import { saveProject } from '#lib/storage/projects.ts';
	import { TILE_NAMES } from '#lib/export/share.ts';

	/** 0–2 = left/middle/right carousel, 3 = not used anywhere. */
	type Slot = 0 | 1 | 2;
	type Group = Slot | 3;
	const UNUSED = 3 as const;
	const GROUPS: Group[] = [0, 1, 2, 3];
	const CAROUSELS: Slot[] = [0, 1, 2];

	const data = new ProjectData(page.params.id ?? '');
	/** Where each movable photo was when the screen opened, and where it is now. */
	let original = $state(new Map<PhotoId, Group>());
	let groupOf = $state(new Map<PhotoId, Group>());
	let working = $state(false);
	let confirming = $state(false);

	$effect(() => {
		void (async () => {
			await data.load();
			const project = data.project;
			if (!project?.carousels || !canMove) return;
			// Read what each carousel holds now, so hand edits in the editor count. Grid tiles
			// (and the row's photos) stay put; a photo used twice counts for its first unlocked
			// carousel, so it can still be moved there.
			const fixed = new Set([
				...(project.row ? rowPhotos(project.row) : []),
				...project.carousels.map((c) => c.backgrounds[0]?.photoId)
			]);
			const map = new Map<PhotoId, Group>();
			const order = [...CAROUSELS].sort((a, b) => +isLocked(project, a) - +isLocked(project, b));
			for (const g of order)
				for (const id of photosIn(project.carousels[g]))
					if (!fixed.has(id) && !map.has(id)) map.set(id, g);
			for (const p of data.photos) if (!fixed.has(p.id) && !map.has(p.id)) map.set(p.id, UNUSED);
			original = map;
			groupOf = new Map(map);
			void data.ensureAnalysis();
		})();
	});

	const ordered = $derived(
		[...data.photos].sort((a, b) => a.importIndex - b.importIndex).map((p) => p.id)
	);
	const members = $derived(GROUPS.map((g) => ordered.filter((id) => groupOf.get(id) === g)));
	const tiles = $derived(data.project?.carousels?.map((c) => c.backgrounds[0]?.photoId) ?? []);
	/** Rebuilding keeps each grid tile, so every carousel needs one. */
	const canMove = $derived(tiles.length === 3 && tiles.every(Boolean));
	/** Locked carousels: nothing moves into or out of them. */
	const locked = $derived(CAROUSELS.filter((g) => isLocked(data.project, g)));
	const isLockedGroup = (g: Group) => g !== UNUSED && locked.includes(g);

	/** Carousels whose set of photos differs from when the screen opened. */
	const changed = $derived(
		CAROUSELS.filter((g) =>
			[...groupOf].some(([id, now]) => (now === g) !== (original.get(id) === g))
		)
	);
	const movedCount = $derived([...groupOf].filter(([id, g]) => original.get(id) !== g).length);

	const groupName = (g: Group) =>
		g === UNUSED ? 'Not used' : `${TILE_NAMES[g][0].toUpperCase()}${TILE_NAMES[g].slice(1)}`;

	function move(id: PhotoId, to: Group) {
		const next = new Map(groupOf);
		next.set(id, to);
		groupOf = next;
	}

	function reset() {
		groupOf = new Map(original);
	}

	const listNames = (gs: Slot[]) =>
		gs.length === 1
			? `the ${TILE_NAMES[gs[0]]} carousel`
			: `the ${gs
					.slice(0, -1)
					.map((g) => TILE_NAMES[g])
					.join(', ')} and ${TILE_NAMES[gs[gs.length - 1]]} carousels`;

	async function rebuild() {
		confirming = false;
		const project = data.project;
		if (!project?.carousels || !canMove || !changed.length) return;
		working = true;
		try {
			await data.ensureAnalysis();
			const photos = toLayoutPhotos(data.photos);
			const preset = await data.preset();
			const carousels = $state.snapshot(project.carousels) as [Carousel, Carousel, Carousel];
			const assignment = [members[0], members[1], members[2]].map((m) => [...m]) as [
				PhotoId[],
				PhotoId[],
				PhotoId[]
			];
			const seed = (Date.now() % 100_000) + 1;
			for (const g of changed) {
				const tile = carousels[g].backgrounds[0] as Background;
				if (!tile?.photoId) continue;
				const ids = assignment[g].filter((id) => id !== tile.photoId);
				const [best] = ids.length
					? await imageWorker().suggestFor(tile, ids, photos, preset, seed + g)
					: [];
				carousels[g] = best ?? { slideCount: 1, backgrounds: [tile], frames: [] };
			}
			data.project = await saveProject({
				...$state.snapshot(project),
				assignment,
				carousels
			});
			await goto(`/p/${project.id}`);
		} catch (e) {
			console.error(e);
			toast.error(e instanceof Error ? e.message : 'Couldn’t rebuild the carousels');
		} finally {
			working = false;
		}
	}
</script>

<AppHeader title="Move photos" backHref="/p/{page.params.id}" backLabel="Project" />

<main class="mx-auto flex max-w-xl flex-col gap-5 pt-4 pb-28">
	{#if data.analysing}
		<div class="flex flex-col gap-1.5 px-4" aria-live="polite">
			<Progress value={(data.analysing.done / data.analysing.total) * 100} />
			<p class="text-xs text-muted-foreground">
				Analysing photos… {data.analysing.done} of {data.analysing.total}
			</p>
		</div>
	{/if}

	{#if data.loaded && !canMove}
		<p class="px-4 text-sm text-muted-foreground">
			Choose a grid tile photo for each carousel first; rebuilt layouts start from it.
		</p>
	{:else if data.loaded}
		<p class="px-4 text-xs text-muted-foreground">
			Tap a photo to move it to another carousel. Only carousels that change are rebuilt; the others
			keep their edits.{locked.length ? ' Locked carousels keep their photos.' : ''}
		</p>

		{#each GROUPS as g (g)}
			{#if g !== UNUSED || members[UNUSED].length || [...original.values()].includes(UNUSED)}
				<section class="flex flex-col gap-2 px-4" aria-labelledby="group-{g}">
					<div class="flex items-center gap-2">
						{#if g !== UNUSED && tiles[g]}
							<StoredImage
								photoId={tiles[g]}
								class="size-7 rounded object-cover ring-1 ring-border"
								alt=""
							/>
						{/if}
						<h2 id="group-{g}" class="text-sm font-medium">
							{groupName(g)}{g === UNUSED ? '' : ' carousel'}
						</h2>
						<span class="text-xs text-muted-foreground tabular-nums">
							{members[g].length}
							{members[g].length === 1 ? 'photo' : 'photos'}
						</span>
						{#if isLockedGroup(g)}
							<span class="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
								<LockIcon class="size-3" aria-hidden="true" /> Locked
							</span>
						{:else if g !== UNUSED && changed.includes(g)}
							<span class="ml-auto text-xs text-amber-700 dark:text-amber-500">Will rebuild</span>
						{/if}
					</div>
					{#if members[g].length}
						<ul class="grid grid-cols-4 gap-2">
							{#each members[g] as id (id)}
								{@const moved = original.get(id) !== g}
								<li>
									{#if isLockedGroup(g)}
										<div
											class="block aspect-square w-full overflow-hidden rounded-md bg-muted opacity-60"
											role="img"
											aria-label="Photo {ordered.indexOf(id) + 1}, locked"
										>
											<StoredImage photoId={id} class="size-full object-cover" />
										</div>
									{:else}
										<DropdownMenu.Root>
											<DropdownMenu.Trigger
												class="relative block aspect-square w-full overflow-hidden rounded-md bg-muted {moved
													? 'ring-2 ring-amber-500'
													: ''}"
												aria-label="Photo {ordered.indexOf(id) + 1}{moved
													? `, moved from ${groupName(original.get(id) ?? UNUSED).toLowerCase()}`
													: ''}"
											>
												<StoredImage photoId={id} class="size-full object-cover" />
											</DropdownMenu.Trigger>
											<DropdownMenu.Content>
												{#each CAROUSELS as to (to)}
													{#if to !== g && !locked.includes(to)}
														<DropdownMenu.Item onclick={() => move(id, to)}>
															<ArrowRightLeftIcon /> Move to {TILE_NAMES[to]}
														</DropdownMenu.Item>
													{/if}
												{/each}
												{#if g !== UNUSED}
													<DropdownMenu.Item onclick={() => move(id, UNUSED)}>
														<CircleSlashIcon /> Leave out
													</DropdownMenu.Item>
												{/if}
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-xs text-muted-foreground">
							{g === UNUSED ? 'None.' : 'No photos besides the grid tile.'}
						</p>
					{/if}
				</section>
			{/if}
		{/each}
	{/if}
</main>

<div
	class="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur"
	style="padding-bottom: env(safe-area-inset-bottom)"
>
	<div class="mx-auto flex max-w-xl gap-2 p-3">
		<Button variant="outline" disabled={!movedCount || working} onclick={reset}>
			<Undo2Icon /> Reset
		</Button>
		<Button
			class="flex-1"
			disabled={!changed.length || working}
			onclick={() => (confirming = true)}
		>
			{working
				? 'Rebuilding…'
				: changed.length
					? `Rebuild ${changed.length} ${changed.length === 1 ? 'carousel' : 'carousels'}`
					: 'Rebuild carousels'}
		</Button>
	</div>
</div>

<AlertDialog.Root bind:open={confirming}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title
				>Rebuild {changed.length === 1 ? 'this carousel' : 'these carousels'}?</AlertDialog.Title
			>
			<AlertDialog.Description>
				New layouts are suggested for {changed.length
					? listNames(changed)
					: 'the changed carousels'}, keeping their grid tiles. Edits to {changed.length === 1
					? 'it'
					: 'them'} are lost.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={rebuild}>Rebuild</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
