<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { subjectDetection as sd } from '#lib/ai/detection.svelte.ts';

	// At launch: notices if the app was killed mid-detection last time.
	$effect(() => {
		void sd.init();
	});

	// Suggests turning detection off when it keeps being slow, or stops unexpectedly.
	$effect(() => {
		const w = sd.warning;
		if (!w) return;
		const id = toast.warning(
			w.kind === 'slow'
				? 'Subject detection is slowing suggestions down'
				: 'Subject detection stopped unexpectedly',
			{
				description: `${
					w.kind === 'crash'
						? 'This device may be short of memory.'
						: w.loadSeconds !== undefined
							? `Loading it took about ${w.loadSeconds} s on this device.`
							: `It’s taking about ${w.seconds} s per photo on this device.`
				} Turn it off? Suggestions still work without it.`,
				duration: Number.POSITIVE_INFINITY,
				// Infinite toasts need a dismiss that doesn't rely on swiping.
				cancel: { label: 'Keep it on', onClick: () => sd.keepOn() },
				action: { label: 'Turn off', onClick: () => sd.disable() },
				onDismiss: () => (sd.warning = null)
			}
		);
		return () => toast.dismiss(id);
	});
</script>
