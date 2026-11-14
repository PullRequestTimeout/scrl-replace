<script lang="ts">
	import '@fontsource-variable/inter/wght.css';
	import './layout.css';
	import type { LayoutProps } from './$types';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import ReloadPrompt from '#lib/components/app/ReloadPrompt.svelte';

	let { children }: LayoutProps = $props();
</script>

<div class="min-h-dvh" style="padding-bottom: env(safe-area-inset-bottom)">
	{@render children()}
</div>

<Toaster position="top-center" />
<ReloadPrompt />
