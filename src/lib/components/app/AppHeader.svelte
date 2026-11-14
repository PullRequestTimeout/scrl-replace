<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';

	interface Props {
		title: string;
		backHref?: string;
		backLabel?: string;
		actions?: Snippet;
	}

	let { title, backHref, backLabel = 'Back', actions }: Props = $props();
</script>

<header
	class="sticky top-0 z-20 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70"
	style="padding-top: env(safe-area-inset-top)"
>
	<div class="flex h-12 items-center gap-1 px-2">
		{#if backHref}
			<a
				href={backHref}
				class="flex h-10 items-center gap-0.5 rounded-md pr-2 pl-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ChevronLeftIcon class="size-5" aria-hidden="true" />
				{backLabel}
			</a>
		{:else}
			<span class="w-2"></span>
		{/if}
		<h1 class="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
		{#if actions}
			<div class="flex items-center gap-1">{@render actions()}</div>
		{/if}
	</div>
</header>
