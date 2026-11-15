<script lang="ts">
	import { goto } from '$app/navigation';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { toast } from 'svelte-sonner';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import { DEFAULT_PRESET_ID, type StylePreset } from '#lib/model/presets.ts';
	import { deletePreset, duplicatePreset, isBuiltIn, listPresets } from '#lib/storage/presets.ts';
	import { getDefaultPresetId, setDefaultPresetId } from '#lib/settings.ts';

	let presets = $state<StylePreset[] | null>(null);
	let defaultId = $state(getDefaultPresetId());
	let deleting = $state<StylePreset | null>(null);

	async function refresh() {
		presets = await listPresets();
		// A deleted default falls back to the built-in style.
		if (!presets.some((p) => p.id === defaultId)) makeDefault(DEFAULT_PRESET_ID);
	}

	$effect(() => {
		void refresh();
	});

	function makeDefault(id: string) {
		defaultId = id;
		setDefaultPresetId(id);
	}

	async function duplicate(preset: StylePreset) {
		const copy = await duplicatePreset(preset.id);
		await goto(`/settings/presets/${copy.id}`);
	}

	async function confirmDelete() {
		if (!deleting) return;
		const { id, name } = deleting;
		deleting = null;
		await deletePreset(id);
		await refresh();
		toast.success(`Deleted “${name}”`);
	}
</script>

<AppHeader title="Styles" backHref="/settings" backLabel="Settings" />

<main class="mx-auto flex max-w-xl flex-col gap-4 p-4">
	<p class="text-sm text-muted-foreground">
		A style is the set of numbers suggestions follow: frame sizes, background spans and how much
		each rule matters. Each project uses one style; new projects start with the default.
	</p>

	{#if presets}
		<ul class="flex flex-col gap-2">
			{#each presets as preset (preset.id)}
				<li class="flex items-center gap-3 rounded-lg border bg-card p-3">
					<a href="/settings/presets/{preset.id}" class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="truncate font-medium">{preset.name}</span>
						<span class="flex flex-wrap gap-1">
							{#if isBuiltIn(preset.id)}<Badge variant="secondary">Built-in</Badge>{/if}
							{#if preset.id === defaultId}<Badge variant="outline">Default for new projects</Badge
								>{/if}
						</span>
					</a>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class={buttonVariants({ variant: 'ghost', size: 'icon' })}
							aria-label="Style options for {preset.name}"
						>
							<EllipsisIcon />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onclick={() => goto(`/settings/presets/${preset.id}`)}>
								{isBuiltIn(preset.id) ? 'View' : 'Edit'}
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => duplicate(preset)}>Duplicate</DropdownMenu.Item>
							{#if preset.id !== defaultId}
								<DropdownMenu.Item onclick={() => makeDefault(preset.id)}>
									Use for new projects
								</DropdownMenu.Item>
							{/if}
							{#if !isBuiltIn(preset.id)}
								<DropdownMenu.Separator />
								<DropdownMenu.Item variant="destructive" onclick={() => (deleting = preset)}>
									Delete
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</li>
			{/each}
		</ul>
		<Button variant="outline" onclick={() => duplicate(presets![0])}>
			<PlusIcon /> New style (a copy of the built-in one)
		</Button>
	{:else}
		<p class="text-sm text-muted-foreground">Loading…</p>
	{/if}
</main>

<AlertDialog.Root open={deleting !== null} onOpenChange={(open) => !open && (deleting = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete “{deleting?.name}”?</AlertDialog.Title>
			<AlertDialog.Description>
				Projects using this style switch to the built-in one for new suggestions. Carousels you’ve
				already made don’t change.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				class={buttonVariants({ variant: 'destructive' })}
				onclick={confirmDelete}
			>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
