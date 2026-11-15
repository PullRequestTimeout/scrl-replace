<script lang="ts">
	import '@fontsource-variable/inter/wght.css';
	import './layout.css';
	import type { LayoutProps } from './$types';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import ReloadPrompt from '#lib/components/app/ReloadPrompt.svelte';
	import ImportRecovery from '#lib/components/app/ImportRecovery.svelte';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { Button } from '#lib/components/ui/button/index.js';

	let { children }: LayoutProps = $props();
</script>

<div class="min-h-dvh" style="padding-bottom: env(safe-area-inset-bottom)">
	<!-- Catches errors while rendering or in effects (not in event handlers), so a crash shows a
	     way out instead of a blank or frozen screen. -->
	<svelte:boundary onerror={(error) => console.error(error)}>
		{@render children()}

		{#snippet failed(error, reset)}
			<main
				class="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 p-6 text-center"
				style="padding-top: max(1.5rem, env(safe-area-inset-top))"
			>
				<TriangleAlertIcon class="size-10 text-muted-foreground" aria-hidden="true" />
				<div class="flex flex-col gap-1">
					<!-- Focused on show so VoiceOver announces the screen instead of going silent. -->
					<h1
						class="text-lg font-semibold outline-none"
						tabindex="-1"
						{@attach (node) => node.focus()}
					>
						Something went wrong
					</h1>
					<p class="text-sm text-muted-foreground">
						Your projects are saved on this device. Reloading usually fixes this.
					</p>
				</div>
				<div class="flex w-full flex-col gap-2">
					<Button size="lg" class="h-11" onclick={() => location.reload()}>Reload app</Button>
					<Button size="lg" class="h-11" variant="outline" onclick={reset}>Try again</Button>
				</div>
				{#if error instanceof Error && error.message}
					<details class="w-full text-sm text-muted-foreground">
						<summary class="cursor-pointer py-2">Technical details</summary>
						<p class="font-mono text-xs wrap-break-word">{error.message}</p>
					</details>
				{/if}
			</main>
		{/snippet}
	</svelte:boundary>
</div>

<!-- In the installed app the page runs under the status bar (black-translucent), so toasts
     must clear the safe area or they render behind the notch / Dynamic Island. -->
<Toaster
	position="top-center"
	offset={{ top: 'calc(env(safe-area-inset-top) + 16px)' }}
	mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
/>
<ReloadPrompt />
<ImportRecovery />
