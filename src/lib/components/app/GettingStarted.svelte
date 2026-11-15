<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { cn } from '#lib/utils.js';

	interface Props {
		/** Index of the step you're on; earlier steps show as done. */
		current: number;
		class?: string;
	}

	let { current, class: className }: Props = $props();

	const STEPS = [
		{ title: 'Import a shoot', detail: 'Pick 10–25 edited photos from Photos.' },
		{
			title: 'Choose a grid row',
			detail: 'Pick three first slides that sit well together on your profile.'
		},
		{
			title: 'Fine-tune the carousels',
			detail: 'Move frames and swap photos. Notes flag anything off your style.'
		},
		{ title: 'Export and post', detail: 'Save the slides to Photos and post them in order.' }
	];
</script>

<ol class={cn('flex flex-col gap-3 text-left', className)} aria-label="Getting started">
	{#each STEPS as step, i (i)}
		{@const done = i < current}
		{@const active = i === current}
		<li class="flex gap-3" aria-current={active ? 'step' : undefined}>
			<span
				class={cn(
					'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums',
					done && 'border-transparent bg-muted text-muted-foreground',
					active && 'border-transparent bg-primary text-primary-foreground'
				)}
				aria-hidden="true"
			>
				{#if done}<CheckIcon class="size-3.5" />{:else}{i + 1}{/if}
			</span>
			<span class="min-w-0 pt-0.5">
				<span
					class={cn(
						'block text-sm',
						active ? 'font-medium' : 'text-muted-foreground',
						done && 'line-through decoration-muted-foreground/50'
					)}
				>
					{step.title}{#if done}<span class="sr-only"> (done)</span>{/if}
				</span>
				{#if !done}
					<span class="block text-xs text-muted-foreground">{step.detail}</span>
				{/if}
			</span>
		</li>
	{/each}
</ol>
