<script lang="ts">
	import '@fontsource-variable/inter/wght.css';
	import './layout.css';
	import type { LayoutProps } from './$types';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import ReloadPrompt from '#lib/components/app/ReloadPrompt.svelte';
	import ImportRecovery from '#lib/components/app/ImportRecovery.svelte';

	let { children }: LayoutProps = $props();
</script>

<div class="min-h-dvh" style="padding-bottom: env(safe-area-inset-bottom)">
	{@render children()}
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
