<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { goto } from '$app/navigation';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import SubjectDetectionSettings from '#lib/components/app/SubjectDetectionSettings.svelte';
	import { createProject, saveProject } from '#lib/storage/projects.ts';
	import { REFERENCE_PROJECT_NAME } from '#lib/fixtures/reference.ts';
	import { getColorSpace, setColorSpace } from '#lib/settings.ts';
	import type { ColorSpace } from '#lib/model/constants.ts';
	import {
		formatBytes,
		requestPersistentStorage,
		storageInfo,
		type StorageInfo
	} from '#lib/storage/persist.ts';

	let info = $state<StorageInfo | null | undefined>(undefined);

	async function refresh() {
		info = await storageInfo();
	}

	$effect(() => {
		void refresh();
	});

	async function persist() {
		await requestPersistentStorage();
		await refresh();
	}

	let colorSpace = $state<ColorSpace>(getColorSpace());

	function chooseColorSpace(value: ColorSpace) {
		colorSpace = value;
		setColorSpace(value);
	}

	async function createReference() {
		const project = await createProject(REFERENCE_PROJECT_NAME);
		await saveProject({ ...project, kind: 'reference' });
		await goto(`/p/${project.id}/import`);
	}

	const built = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(new Date(__BUILD_DATE__));
</script>

<AppHeader title="Settings" backHref="/" backLabel="Projects" />

<main class="mx-auto flex max-w-xl flex-col gap-6 p-4">
	<section class="flex flex-col gap-3 rounded-lg border bg-card p-4">
		<h2 class="font-medium">Storage</h2>
		{#if info === undefined}
			<p class="text-sm text-muted-foreground">Checking…</p>
		{:else if info === null}
			<p class="text-sm text-muted-foreground">This browser doesn’t report storage use.</p>
		{:else}
			<Progress value={info.quota ? (info.usage / info.quota) * 100 : 0} />
			<p class="text-sm text-muted-foreground">
				{formatBytes(info.usage)} used of about {formatBytes(info.quota)} available.
			</p>
			<p class="text-sm">
				{#if info.persisted}
					Storage is persistent: projects won’t be cleared automatically.
				{:else}
					Storage isn’t marked persistent yet. Installing to the Home Screen is the most reliable
					way to keep projects.
				{/if}
			</p>
			{#if !info.persisted}
				<Button variant="outline" onclick={persist}>Request persistent storage</Button>
			{/if}
		{/if}
		<p class="text-xs text-muted-foreground">
			Delete projects from the Projects screen to free space.
		</p>
	</section>

	<a
		href="/settings/presets"
		class="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 text-sm outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
	>
		<span>
			<span class="block font-medium">Styles</span>
			<span class="text-muted-foreground">
				Frame sizes, background spans and rule priorities used for suggestions.
			</span>
		</span>
		<ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
	</a>

	<section class="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
		<h2 class="font-medium">Colour</h2>
		<p class="text-muted-foreground">
			Colour space for imported copies and exports. Run the colour test, post both versions, and
			keep whichever looks right on Instagram. Changing this affects photos imported afterwards.
		</p>
		<div class="flex rounded-md border p-0.5" role="radiogroup" aria-label="Colour space">
			{#each [['srgb', 'sRGB'], ['display-p3', 'Display P3']] as [value, label] (value)}
				<button
					type="button"
					role="radio"
					aria-checked={colorSpace === value}
					class="flex-1 rounded px-2 py-1.5 {colorSpace === value
						? 'bg-secondary text-foreground'
						: 'text-muted-foreground'}"
					onclick={() => chooseColorSpace(value as ColorSpace)}>{label}</button
				>
			{/each}
		</div>
		<a href="/settings/colour" class="text-sm underline underline-offset-4">Run the colour test</a>
	</section>

	<SubjectDetectionSettings />

	<section class="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
		<h2 class="font-medium">Reference carousels</h2>
		<p class="text-muted-foreground">
			Rebuilds your three SCRL carousels from their 17 original photos, to check export quality
			against what you posted.
		</p>
		<Button variant="outline" onclick={createReference}>Create reference project</Button>
	</section>

	<section class="flex flex-col gap-1 rounded-lg border bg-card p-4 text-sm">
		<h2 class="font-medium">About</h2>
		<p class="text-muted-foreground">Version {__APP_VERSION__} · built {built}</p>
		<p class="text-muted-foreground">Works offline. Photos never leave this device.</p>
	</section>
</main>
