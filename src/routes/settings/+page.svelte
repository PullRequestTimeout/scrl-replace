<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
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

	<section class="flex flex-col gap-1 rounded-lg border bg-card p-4 text-sm">
		<h2 class="font-medium">About</h2>
		<p class="text-muted-foreground">Version {__APP_VERSION__} · built {built}</p>
		<p class="text-muted-foreground">Works offline. Photos never leave this device.</p>
	</section>
</main>
