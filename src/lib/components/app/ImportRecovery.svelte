<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { takeInterruptedImport } from '#lib/import/import-guard.ts';
	import { getProject } from '#lib/storage/projects.ts';

	/** "4 of 12 photos were saved", "1 of 12 photos was saved", "1 photo was saved". */
	function savedText(done: number, total: number, projectName: string) {
		if (done === 0) return `None of the photos were saved to “${projectName}”.`;
		const count = total > done ? `${done} of ${total}` : `${done}`;
		const noun = total > 1 || done > 1 ? 'photos' : 'photo';
		return `${count} ${noun} ${done === 1 ? 'was' : 'were'} saved to “${projectName}”.`;
	}

	// Runs once at launch: a marker left behind means the page was killed (or reloaded) mid-import.
	$effect(() => {
		const marker = takeInterruptedImport();
		if (!marker) return;
		void getProject(marker.projectId).then((project) => {
			if (!project) return;
			toast.warning('Your last import didn’t finish', {
				description: `It stopped on “${marker.current}”, possibly because Strip ran out of memory. ${savedText(marker.done, marker.total, project.name)}`,
				duration: Number.POSITIVE_INFINITY,
				// Infinite toasts need a dismiss that doesn't rely on swiping.
				cancel: { label: 'Dismiss', onClick: () => {} },
				action: {
					label: 'Add the rest',
					onClick: () => void goto(`/p/${project.id}/import`)
				}
			});
		});
	});
</script>
