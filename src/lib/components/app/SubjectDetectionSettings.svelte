<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { subjectDetection as sd } from '#lib/ai/detection.svelte.ts';
	import { MODEL_BYTES } from '#lib/ai/model.ts';
	import { formatBytes } from '#lib/storage/persist.ts';

	$effect(() => {
		void sd.init();
	});

	const size = formatBytes(MODEL_BYTES);
	const busy = $derived(sd.status === 'downloading' || sd.status === 'testing');
</script>

<section class="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm" aria-busy={busy}>
	<h2 class="font-medium">Subject detection</h2>
	<p class="text-muted-foreground">
		Recognises what each photo shows, so photos without a strong subject (mist, textures, a guest
		book) are suggested as backgrounds under frames, and strong ones get the prominent spots. Runs
		on this device; photos never leave it. One-time {size} download.
	</p>

	<div aria-live="polite" class="flex flex-col gap-2">
		{#if sd.status === 'checking'}
			<p class="text-muted-foreground">Checking this device…</p>
		{:else if sd.status === 'unsupported'}
			<p>Not available on this device: {sd.reason}.</p>
		{:else if sd.status === 'downloading'}
			<Progress value={sd.progress * 100} aria-label="Model download" />
			<p class="text-muted-foreground">
				Downloading… {formatBytes(sd.progress * MODEL_BYTES)} of {size}
			</p>
		{:else if sd.status === 'testing'}
			<p class="text-muted-foreground">Testing speed on this device…</p>
		{:else if sd.status === 'on'}
			<p>
				{sd.benchmarkMs === null
					? 'On.'
					: `On · about ${Math.max(1, Math.round(sd.benchmarkMs))} ms per photo.`}
			</p>
		{:else if sd.status === 'too-slow'}
			<p>
				This device is too slow for it (about {Math.round(sd.benchmarkMs ?? 0)} ms per photo), so it’s
				been left off.
			</p>
		{:else if sd.status === 'error'}
			<p class="text-destructive">{sd.reason}</p>
		{:else}
			<p class="text-muted-foreground">Off.</p>
		{/if}
	</div>

	{#if sd.status === 'on'}
		<Button variant="outline" onclick={() => sd.disable()}>Turn off</Button>
	{:else if sd.status === 'off' || sd.status === 'error'}
		<Button variant="outline" onclick={() => sd.enable()}>
			{sd.status === 'error' ? 'Try again' : sd.downloaded ? 'Turn on' : `Download and turn on`}
		</Button>
	{:else if sd.status === 'too-slow'}
		<Button variant="outline" onclick={() => sd.enable()}>Test again</Button>
	{/if}

	{#if sd.downloaded && !busy && sd.status !== 'unsupported'}
		<Button variant="ghost" class="text-muted-foreground" onclick={() => sd.removeModel()}>
			Remove downloaded model
		</Button>
	{/if}
</section>
