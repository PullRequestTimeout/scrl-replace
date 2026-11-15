<script lang="ts">
	// Hidden go/no-go test page for on-device subject detection. Not linked from the app.
	import * as Comlink from 'comlink';
	import { Button } from '#lib/components/ui/button/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import type { AiWorkerApi, EmbedResult, LoadInfo } from '#lib/ai/ai.worker.ts';
	import type { AiBackend, AiPrecision } from '#lib/ai/model.ts';
	import AiWorker from '#lib/ai/ai.worker.ts?worker';

	interface Row extends Partial<EmbedResult> {
		name: string;
		error?: string;
	}

	let backend = $state<AiBackend>('gpu' in navigator ? 'webgpu' : 'wasm');
	let precision = $state<AiPrecision>('fp16');
	let status = $state('Idle');
	let load = $state<LoadInfo | null>(null);
	let rows = $state<Row[]>([]);
	let busy = $state(false);
	let totalMs = $state(0);
	let crashed = $state(false);

	let raw: Worker | undefined;
	let worker: Comlink.Remote<AiWorkerApi> | undefined;

	function fresh() {
		raw?.terminate();
		raw = new AiWorker();
		crashed = false;
		raw.addEventListener('error', () => (crashed = true));
		worker = Comlink.wrap<AiWorkerApi>(raw);
	}

	const median = (xs: number[]) => {
		const s = [...xs].sort((a, b) => a - b);
		return s.length ? s[Math.floor(s.length / 2)] : 0;
	};

	// The first run includes warm-up (shader compile etc.), so it's left out of the median.
	const steady = $derived(rows.slice(1).flatMap((r) => (r.inferMs ? [r.inferMs] : [])));
	const prep = $derived(rows.flatMap((r) => (r.prepMs ? [r.prepMs] : [])));

	async function run(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		if (!files.length) return;
		busy = true;
		rows = files.map((f) => ({ name: f.name }));
		totalMs = 0;
		try {
			fresh();
			status = `Loading ${precision} model on ${backend}…`;
			load = await worker!.load(backend, precision);
			const t0 = performance.now();
			for (let i = 0; i < files.length; i++) {
				status = `Photo ${i + 1} of ${files.length}`;
				try {
					rows[i] = { name: files[i].name, ...(await worker!.embed(files[i])) };
				} catch (err) {
					rows[i] = { name: files[i].name, error: String(err) };
					if (crashed) break;
				}
				totalMs = performance.now() - t0;
			}
			status = crashed ? 'The worker crashed (likely out of memory)' : 'Done';
		} catch (err) {
			status = `Failed: ${err}`;
		} finally {
			busy = false;
		}
	}

	const ms = (v: number | undefined) => (v === undefined ? '–' : `${Math.round(v)} ms`);
</script>

<AppHeader title="Subject detection test" backHref="/settings" backLabel="Settings" />

<main class="mx-auto flex max-w-xl flex-col gap-4 p-4 pb-16 text-sm">
	<p class="text-muted-foreground">
		Pick 20–25 photos. Each is scored 0 (background material) to 1 (strong subject). Screenshot the
		summary when it's done.
	</p>

	<div class="flex flex-wrap gap-2">
		{#each ['webgpu', 'wasm'] as const as b (b)}
			<Button
				variant={backend === b ? 'default' : 'outline'}
				size="sm"
				disabled={busy || (b === 'webgpu' && !('gpu' in navigator))}
				onclick={() => (backend = b)}>{b === 'webgpu' ? 'WebGPU' : 'WebAssembly'}</Button
			>
		{/each}
		{#each ['fp16', 'fp32'] as const as p (p)}
			<Button
				variant={precision === p ? 'default' : 'outline'}
				size="sm"
				disabled={busy}
				onclick={() => (precision = p)}>{p === 'fp16' ? '23 MB model' : '46 MB model'}</Button
			>
		{/each}
	</div>

	<label
		class="inline-flex h-11 cursor-pointer items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground has-disabled:opacity-50"
	>
		Pick photos and run
		<input type="file" accept="image/*" multiple class="sr-only" disabled={busy} onchange={run} />
	</label>

	<section class="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed" aria-live="polite">
		<div>Status: {status}</div>
		<div>WebGPU in browser: {'gpu' in navigator ? 'yes' : 'no'}</div>
		{#if load}
			<div>Backend: {load.backend} · model {(load.bytes / 1e6).toFixed(1)} MB</div>
			<div>Download {ms(load.downloadMs)} · session {ms(load.createMs)}</div>
		{/if}
		{#if rows.length}
			<div>First photo (warm-up): {ms(rows[0]?.inferMs)}</div>
			<div>Median model time: {ms(median(steady))} · max {ms(Math.max(0, ...steady))}</div>
			<div>Median prep time: {ms(median(prep))}</div>
			<div>Total for {rows.filter((r) => r.inferMs).length} photos: {ms(totalMs)}</div>
		{/if}
	</section>

	<ol class="flex flex-col gap-2">
		{#each rows as r, i (i)}
			<li class="rounded-md border border-border p-2">
				<div class="flex justify-between gap-2">
					<span class="truncate font-medium">{r.name}</span>
					<span class="font-mono tabular-nums"
						>{r.strength === undefined ? '' : r.strength.toFixed(2)}</span
					>
				</div>
				{#if r.error}
					<div class="text-destructive">{r.error}</div>
				{:else if r.top}
					<div class="text-muted-foreground">
						{r.top.map((t) => `${t.text} ${Math.round(t.p * 100)}%`).join(' · ')}
					</div>
					<div class="font-mono text-xs text-muted-foreground">
						model {ms(r.inferMs)} · prep {ms(r.prepMs)}
					</div>
				{/if}
			</li>
		{/each}
	</ol>
</main>
