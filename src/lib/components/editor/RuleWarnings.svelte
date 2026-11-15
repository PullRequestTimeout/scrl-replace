<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonAlertIcon from '@lucide/svelte/icons/octagon-alert';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import * as Drawer from '#lib/components/ui/drawer/index.js';
	import type { RuleWarning } from '#lib/layout/warnings.ts';

	interface Props {
		warnings: RuleWarning[];
		/** Tapped a warning that points at a frame or background. */
		onShow: (warning: RuleWarning) => void;
	}

	let { warnings, onShow }: Props = $props();
	let open = $state(false);

	const hard = $derived(warnings.filter((w) => w.level === 'hard'));
	const soft = $derived(warnings.filter((w) => w.level === 'soft'));
	const label = $derived(
		warnings.length === 0
			? 'Follows your style'
			: `${warnings.length} style note${warnings.length === 1 ? '' : 's'}`
	);

	function show(w: RuleWarning) {
		open = false;
		onShow(w);
	}
</script>

{#snippet list(items: RuleWarning[], heading: string, hint: string)}
	{#if items.length}
		<section class="flex flex-col gap-1">
			<h3 class="px-4 text-xs font-medium text-muted-foreground">
				{heading} <span class="font-normal">· {hint}</span>
			</h3>
			<ul>
				{#each items as w (w.key)}
					<li>
						{#if w.target}
							<button
								type="button"
								class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-accent/50"
								onclick={() => show(w)}
							>
								{@render icon(w)}
								<span class="flex-1">{w.message}</span>
								<ChevronRightIcon class="size-4 text-muted-foreground" aria-hidden="true" />
							</button>
						{:else}
							<div class="flex items-center gap-3 px-4 py-2.5 text-sm">
								{@render icon(w)}
								<span class="flex-1">{w.message}</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

{#snippet icon(w: RuleWarning)}
	{#if w.level === 'hard'}
		<OctagonAlertIcon class="size-4 shrink-0 text-destructive" aria-hidden="true" />
		<span class="sr-only">Rule:</span>
	{:else}
		<TriangleAlertIcon
			class="size-4 shrink-0 text-amber-600 dark:text-amber-400"
			aria-hidden="true"
		/>
		<span class="sr-only">Note:</span>
	{/if}
{/snippet}

<!-- Announces the count as it changes after edits. -->
<span role="status" class="sr-only">{label}</span>
{#if warnings.length}
	<button
		type="button"
		class="relative flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs after:absolute after:-inset-1.5 after:content-[''] {hard.length
			? 'bg-destructive/10 text-destructive'
			: 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}"
		onclick={() => (open = true)}
		aria-label="{label}. Show list"
	>
		<TriangleAlertIcon class="size-3.5" aria-hidden="true" />
		<span class="tabular-nums" aria-hidden="true">{warnings.length}</span>
	</button>
{:else}
	<span
		class="flex h-8 items-center gap-1 px-2 text-xs text-muted-foreground"
		title={label}
		aria-hidden="true"
	>
		<CircleCheckIcon class="size-3.5" />
	</span>
{/if}

<Drawer.Root bind:open>
	<Drawer.Content class="max-h-[85dvh]">
		<Drawer.Header>
			<Drawer.Title>{label}</Drawer.Title>
			<Drawer.Description>
				Checked against your style as you edit. These never stop you exporting.
			</Drawer.Description>
		</Drawer.Header>
		<div class="flex flex-col gap-4 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
			{@render list(hard, 'Rules', 'your posts never do this')}
			{@render list(soft, 'Style notes', 'worth a look')}
		</div>
	</Drawer.Content>
</Drawer.Root>
