<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { subjectDetection as sd } from '#lib/ai/detection.svelte.ts';
	import { MODEL_BYTES } from '#lib/ai/model.ts';
	import { formatBytes } from '#lib/storage/persist.ts';

	$effect(() => {
		void sd.init();
	});

	const size = formatBytes(MODEL_BYTES);
	const busy = $derived(
		sd.status === 'checking' || sd.status === 'downloading' || sd.status === 'testing'
	);
	const percent = $derived(Math.round(sd.progress * 100));
	const perPhoto = $derived(Math.max(1, Math.round(sd.benchmarkMs ?? 0)));

	/**
	 * One main button stays mounted through every state, so VoiceOver focus isn't dropped when
	 * the action changes. While busy it's aria-disabled (not disabled, which would lose focus).
	 */
	const primary = $derived.by((): { label: string; run?: () => void } | null => {
		switch (sd.status) {
			case 'unsupported':
				return null;
			case 'checking':
				return { label: 'Checking…' };
			case 'downloading':
				return { label: 'Downloading…' };
			case 'testing':
				return { label: 'Testing…' };
			case 'on':
				return { label: 'Turn off', run: () => sd.disable() };
			case 'too-slow':
				return { label: 'Test again', run: () => sd.enable() };
			case 'error':
				return { label: 'Try again', run: () => sd.enable() };
			default:
				return {
					label: sd.downloaded ? 'Turn on' : 'Download and turn on',
					run: () => sd.enable()
				};
		}
	});

	let primaryRef = $state<HTMLButtonElement | null>(null);

	// Removing takes two taps: the model can only be fetched again with a connection.
	let confirmRemove = $state(false);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;

	async function remove() {
		if (!confirmRemove) {
			confirmRemove = true;
			clearTimeout(confirmTimer);
			confirmTimer = setTimeout(() => (confirmRemove = false), 4000);
			return;
		}
		clearTimeout(confirmTimer);
		confirmRemove = false;
		await sd.removeModel();
		await tick();
		primaryRef?.focus(); // The remove button is gone; keep focus in the section.
	}

	$effect(() => () => clearTimeout(confirmTimer));
</script>

<section class="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
	<h2 class="font-medium">Subject detection</h2>
	<p class="text-muted-foreground">
		Spots photos with no strong subject (mist, textures, a guest book) and suggests them as
		backgrounds under frames. Strong subjects get the prominent spots. Runs on this device, so
		photos never leave it. One-time {size} download.
	</p>

	<p role="status">
		{#if sd.status === 'checking'}
			<span class="text-muted-foreground">Checking this device…</span>
		{:else if sd.status === 'unsupported'}
			Not available on this device: {sd.reason}.
		{:else if sd.status === 'downloading'}
			Downloading the model…
		{:else if sd.status === 'testing'}
			Testing speed on this device…
		{:else if sd.status === 'on'}
			{sd.benchmarkMs === null ? 'On.' : `On. About ${perPhoto} ms per photo.`}
		{:else if sd.status === 'too-slow'}
			This device is too slow for subject detection (about {perPhoto} ms per photo), so it’s been left
			off.
		{:else if sd.status === 'off'}
			<span class="text-muted-foreground">
				{sd.downloaded ? 'Off. The model is already on this device.' : 'Off.'}
			</span>
		{/if}
	</p>

	<div role="alert">
		{#if sd.status === 'error'}
			<p class="text-destructive">{sd.reason}</p>
		{/if}
	</div>

	{#if sd.status === 'downloading'}
		<div class="flex flex-col gap-1.5">
			<Progress value={percent} aria-label="Model download" aria-valuetext="{percent}% of {size}" />
			<!-- The bar already reports progress to VoiceOver. -->
			<p class="text-muted-foreground" aria-hidden="true">
				{formatBytes(sd.progress * MODEL_BYTES)} of {size}
			</p>
		</div>
	{/if}

	{#if primary}
		<Button
			bind:ref={primaryRef}
			variant="outline"
			aria-disabled={primary.run ? undefined : 'true'}
			class="aria-disabled:opacity-50"
			onclick={() => primary.run?.()}>{primary.label}</Button
		>
	{/if}

	{#if sd.downloaded && !busy && sd.status !== 'unsupported'}
		<div class="mt-1 flex flex-col gap-1 border-t pt-3">
			<Button variant="ghost" class="text-muted-foreground" onclick={remove}>
				{confirmRemove ? 'Tap again to remove' : `Remove model (${size})`}
			</Button>
			<p class="text-center text-xs text-muted-foreground">
				You’ll need a connection to download it again.
			</p>
		</div>
	{/if}
</section>
