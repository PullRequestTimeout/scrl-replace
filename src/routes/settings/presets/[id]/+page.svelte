<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate, goto } from '$app/navigation';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import PresetPreview from '#lib/components/app/PresetPreview.svelte';
	import {
		DEFAULT_PRESET,
		NUMBER_LIMITS,
		RANGE_LIMITS,
		WEIGHT_LIMITS,
		type ScoreWeights,
		type StylePreset
	} from '#lib/model/presets.ts';
	import { duplicatePreset, getPreset, isBuiltIn, savePreset } from '#lib/storage/presets.ts';

	type RangeKey = keyof typeof RANGE_LIMITS;
	type NumberKey = keyof typeof NUMBER_LIMITS;
	type WeightKey = keyof ScoreWeights;
	interface Row<K> {
		key: K;
		label: string;
		hint: string;
		fmt: (v: number) => string;
	}

	let id = $state(page.params.id ?? '');
	const readOnly = $derived(isBuiltIn(id));
	let preset = $state<StylePreset | null>(null);
	let missing = $state(false);
	let name = $state('');

	$effect(() => {
		void (async () => {
			missing = false;
			const loaded = await getPreset(page.params.id);
			// getPreset falls back to the default for unknown ids.
			if (loaded.id !== page.params.id) {
				missing = true;
				return;
			}
			id = loaded.id;
			preset = loaded;
			name = loaded.name;
		})();
	});

	async function save() {
		if (!preset || readOnly) return;
		try {
			preset = await savePreset($state.snapshot(preset) as StylePreset);
		} catch (e) {
			console.error(e);
			toast.error('Couldn’t save the style');
		}
	}

	// The name saves shortly after typing stops, and before leaving the page.
	const nameEmpty = $derived(!name.trim());
	let nameTimer: ReturnType<typeof setTimeout> | undefined;

	function commitName() {
		clearTimeout(nameTimer);
		if (!preset || nameEmpty || name.trim() === preset.name) return;
		preset.name = name.trim();
		void save();
	}

	function onNameInput() {
		clearTimeout(nameTimer);
		if (!nameEmpty) nameTimer = setTimeout(commitName, 400);
	}

	function onNameBlur() {
		if (nameEmpty) name = preset?.name ?? '';
		else commitName();
	}

	beforeNavigate(commitName);

	async function resetValues() {
		if (!preset) return;
		preset = { ...structuredClone(DEFAULT_PRESET), id: preset.id, name: preset.name };
		await save();
		toast.success(`Values reset to ${DEFAULT_PRESET.name}`);
	}

	async function duplicate() {
		const copy = await duplicatePreset(id);
		await goto(`/settings/presets/${copy.id}`, { replaceState: true });
	}

	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const slides = (v: number) => v.toFixed(1);
	const px = (v: number) => `${v}px`;

	const FRAME_RANGES: Row<RangeKey>[] = [
		{ key: 'frameHeight', label: 'Frame height', hint: 'Of the slide height', fmt: pct }
	];
	const FRAME_NUMBERS: Row<NumberKey>[] = [
		{
			key: 'borderRatio',
			label: 'Border',
			hint: 'Of the frame’s height',
			fmt: (v) => `${(v * 100).toFixed(1)}%`
		},
		{
			key: 'frameMargin',
			label: 'Top and bottom margin',
			hint: 'Space above and below a frame',
			fmt: px
		},
		{ key: 'frameGap', label: 'Gap between frames', hint: 'Of a slide’s width', fmt: pct }
	];
	const BG_RANGES: Row<RangeKey>[] = [
		{ key: 'bgSpanLandscape', label: 'Landscape span', hint: 'In slides', fmt: slides },
		{ key: 'bgSpanPortrait', label: 'Portrait span', hint: 'In slides', fmt: slides },
		{ key: 'bgSpanSquare', label: 'Square span', hint: 'In slides', fmt: slides }
	];
	const BG_NUMBERS: Row<NumberKey>[] = [
		{
			key: 'joinClearance',
			label: 'Join clearance',
			hint: 'How far a visible join stays from a slide edge',
			fmt: px
		}
	];
	const WEIGHTS: { key: WeightKey; label: string }[] = [
		{ key: 'contrast', label: 'Contrast between a frame and its background' },
		{ key: 'joinCovered', label: 'Hide joins under frames' },
		{ key: 'joinNearEdge', label: 'Keep visible joins away from slide edges' },
		{ key: 'framePlacement', label: 'Centre frames on slides' },
		{ key: 'frameCoversSubject', label: 'Keep frames off a background’s subject' },
		{ key: 'backgroundHidden', label: 'Don’t bury a background under frames' },
		{ key: 'subjectCut', label: 'Don’t cut a subject at a slide edge' },
		{ key: 'frameHeight', label: 'Keep frames within the height range' },
		{ key: 'bgSpan', label: 'Keep backgrounds within their spans' },
		{ key: 'lastSlideCovered', label: 'Keep the last slide free of frames' },
		{ key: 'adjacentDuplicate', label: 'Keep similar photos apart' },
		{ key: 'rhythm', label: 'Vary neighbours (colour and B&W, shot type)' },
		{ key: 'upscale', label: 'Avoid enlarging photos past their resolution' }
	];
</script>

{#snippet rowLabel(label: string, hint: string, value: string)}
	<div class="flex items-baseline justify-between gap-3">
		<span>
			<span class="text-sm">{label}</span>
			{#if hint}<span class="block text-xs text-muted-foreground">{hint}</span>{/if}
		</span>
		<span class="shrink-0 text-sm tabular-nums">{value}</span>
	</div>
{/snippet}

{#snippet rangeRow(p: StylePreset, row: Row<RangeKey>)}
	{@const limits = RANGE_LIMITS[row.key]}
	<div class="flex items-center gap-3">
		<div class="flex min-w-0 flex-1 flex-col gap-2">
			{@render rowLabel(row.label, row.hint, `${row.fmt(p[row.key][0])}–${row.fmt(p[row.key][1])}`)}
			<Slider
				type="multiple"
				min={limits.min}
				max={limits.max}
				step={limits.step}
				value={[...p[row.key]]}
				disabled={readOnly}
				onValueChange={(v: number[]) => {
					p[row.key] = [v[0], v[1]];
				}}
				onValueCommit={save}
				thumbLabels={[`${row.label}, minimum`, `${row.label}, maximum`]}
				valueText={row.fmt}
			/>
		</div>
		<div class="flex w-24 shrink-0 justify-center">
			<PresetPreview kind={row.key} preset={p} />
		</div>
	</div>
{/snippet}

{#snippet numberRow(p: StylePreset, row: Row<NumberKey>)}
	{@const limits = NUMBER_LIMITS[row.key]}
	<div class="flex items-center gap-3">
		<div class="flex min-w-0 flex-1 flex-col gap-2">
			{@render rowLabel(row.label, row.hint, row.fmt(p[row.key]))}
			<Slider
				type="single"
				min={limits.min}
				max={limits.max}
				step={limits.step}
				value={p[row.key]}
				disabled={readOnly}
				onValueChange={(v: number) => {
					p[row.key] = v;
				}}
				onValueCommit={save}
				aria-label={row.label}
				valueText={row.fmt}
			/>
		</div>
		<div class="flex w-24 shrink-0 justify-center">
			<PresetPreview kind={row.key} preset={p} />
		</div>
	</div>
{/snippet}

<AppHeader title={preset?.name ?? 'Style'} backHref="/settings/presets" backLabel="Styles" />

<main class="mx-auto flex max-w-xl flex-col gap-4 p-4 pb-12">
	{#if missing}
		<p class="text-sm text-muted-foreground">
			This style no longer exists. <a class="underline" href="/settings/presets">Back to styles</a>
		</p>
	{:else if preset}
		{#if readOnly}
			<section class="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
				<p class="text-muted-foreground">
					This is the built-in style, tuned to your reference carousels. It can’t be changed, so you
					can always come back to it. Duplicate it to make your own.
				</p>
				<Button onclick={duplicate}><CopyIcon /> Duplicate to edit</Button>
			</section>
		{:else}
			<section class="flex flex-col gap-2 rounded-lg border bg-card p-4">
				<Label for="preset-name">Name</Label>
				<Input
					id="preset-name"
					bind:value={name}
					autocomplete="off"
					aria-invalid={nameEmpty}
					aria-describedby={nameEmpty ? 'preset-name-error' : undefined}
					oninput={onNameInput}
					onblur={onNameBlur}
					onkeydown={(e: KeyboardEvent) =>
						e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
				/>
				{#if nameEmpty}
					<p id="preset-name-error" class="text-xs text-destructive">
						A style needs a name. Leaving it empty keeps “{preset.name}”.
					</p>
				{/if}
				<p class="text-xs text-muted-foreground">
					Changes save as you go and apply to the next suggestions in projects using this style.
				</p>
			</section>
		{/if}

		<section class="flex flex-col gap-5 rounded-lg border bg-card p-4">
			<h2 class="font-medium">Frames</h2>
			{#each FRAME_RANGES as row (row.key)}{@render rangeRow(preset, row)}{/each}
			{#each FRAME_NUMBERS as row (row.key)}{@render numberRow(preset, row)}{/each}
		</section>

		<section class="flex flex-col gap-5 rounded-lg border bg-card p-4">
			<h2 class="font-medium">Backgrounds</h2>
			{#each BG_RANGES as row (row.key)}{@render rangeRow(preset, row)}{/each}
			{#each BG_NUMBERS as row (row.key)}{@render numberRow(preset, row)}{/each}
		</section>

		<section class="flex flex-col gap-5 rounded-lg border bg-card p-4">
			<div>
				<h2 class="font-medium">Priorities</h2>
				<p class="text-xs text-muted-foreground">
					How much each rule counts when ranking layouts. 0 turns a rule off.
				</p>
			</div>
			{#each WEIGHTS as w (w.key)}
				{@const p = preset}
				<div class="flex flex-col gap-2">
					{@render rowLabel(w.label, '', String(p.weights[w.key]))}
					<Slider
						type="single"
						min={WEIGHT_LIMITS.min}
						max={WEIGHT_LIMITS.max}
						step={WEIGHT_LIMITS.step}
						value={p.weights[w.key]}
						disabled={readOnly}
						onValueChange={(v: number) => {
							p.weights[w.key] = v;
						}}
						onValueCommit={save}
						aria-label={w.label}
					/>
				</div>
			{/each}
		</section>

		{#if !readOnly}
			<Button variant="outline" onclick={resetValues}>
				<RotateCcwIcon /> Reset values to {DEFAULT_PRESET.name}
			</Button>
		{/if}
	{:else}
		<p class="text-sm text-muted-foreground">Loading…</p>
	{/if}
</main>
