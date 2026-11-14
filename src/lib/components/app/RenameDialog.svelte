<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	interface Props {
		open: boolean;
		initial: string;
		onSave: (name: string) => void;
		onCancel: () => void;
	}

	let { open, initial, onSave, onCancel }: Props = $props();

	let name = $state('');
	$effect(() => {
		if (open) name = initial;
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = name.trim();
		if (trimmed) onSave(trimmed);
	}
</script>

<Dialog.Root {open} onOpenChange={(next) => !next && onCancel()}>
	<Dialog.Content>
		<form onsubmit={submit} class="flex flex-col gap-4">
			<Dialog.Header>
				<Dialog.Title>Rename project</Dialog.Title>
			</Dialog.Header>
			<div class="flex flex-col gap-2">
				<Label for="project-name">Name</Label>
				<Input id="project-name" bind:value={name} autocomplete="off" />
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
				<Button type="submit" disabled={!name.trim()}>Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
