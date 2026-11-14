<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { toast } from 'svelte-sonner';

	const HOUR = 60 * 60 * 1000;

	const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
		onRegisteredSW(swUrl, registration) {
			if (!registration) return;
			// Check for a new version hourly while the app is open and online.
			setInterval(async () => {
				if (registration.installing || !navigator.onLine) return;
				try {
					const response = await fetch(swUrl, { cache: 'no-store' });
					if (response.ok) await registration.update();
				} catch {
					// Offline or flaky network: try again next hour.
				}
			}, HOUR);
		},
		onRegisterError(error) {
			console.error('Service worker registration failed', error);
		}
	});

	$effect(() => {
		if ($offlineReady) {
			toast.success('Ready to work offline');
			offlineReady.set(false);
		}
	});

	$effect(() => {
		if ($needRefresh) {
			// Prompt instead of auto-reloading so an update never interrupts an edit.
			toast('Update available', {
				description: 'Reload to get the latest version.',
				duration: Number.POSITIVE_INFINITY,
				action: { label: 'Reload', onClick: () => void updateServiceWorker() },
				onDismiss: () => needRefresh.set(false)
			});
		}
	});
</script>
