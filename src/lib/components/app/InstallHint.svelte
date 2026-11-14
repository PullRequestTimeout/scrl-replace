<script lang="ts">
	import ShareIcon from '@lucide/svelte/icons/share';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '#lib/components/ui/button/index.js';

	const DISMISS_KEY = 'install-hint-dismissed';

	function shouldShow(): boolean {
		const standalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true);
		if (standalone) return false;
		try {
			return localStorage.getItem(DISMISS_KEY) !== '1';
		} catch {
			return true;
		}
	}

	let visible = $state(shouldShow());

	function dismiss() {
		visible = false;
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			// Storage blocked: the hint simply shows again next time.
		}
	}
</script>

{#if visible}
	<aside class="mx-4 mb-4 flex items-start gap-3 rounded-lg border bg-card p-3 text-sm">
		<ShareIcon class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
		<p class="flex-1 text-muted-foreground">
			Install to your Home Screen to keep projects safe and work offline: tap
			<span class="font-medium text-foreground">Share</span>, then
			<span class="font-medium text-foreground">Add to Home Screen</span>.
		</p>
		<Button variant="ghost" size="icon-sm" onclick={dismiss} aria-label="Dismiss">
			<XIcon />
		</Button>
	</aside>
{/if}
