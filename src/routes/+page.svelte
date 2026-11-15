<script lang="ts">
	import { goto } from '$app/navigation';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import ImagesIcon from '@lucide/svelte/icons/images';
	import { toast } from 'svelte-sonner';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import AppHeader from '#lib/components/app/AppHeader.svelte';
	import GettingStarted from '#lib/components/app/GettingStarted.svelte';
	import InstallHint from '#lib/components/app/InstallHint.svelte';
	import RenameDialog from '#lib/components/app/RenameDialog.svelte';
	import StoredImage from '#lib/components/app/StoredImage.svelte';
	import type { Project } from '#lib/model/types.ts';
	import {
		createProject,
		deleteProject,
		duplicateProject,
		listProjects,
		renameProject
	} from '#lib/storage/projects.ts';

	let projects = $state<Project[] | null>(null);
	let renaming = $state<Project | null>(null);
	let deleting = $state<Project | null>(null);

	async function refresh() {
		projects = await listProjects();
	}

	$effect(() => {
		void refresh();
	});

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

	async function newProject() {
		const project = await createProject(`Shoot – ${dateFormat.format(new Date())}`);
		await goto(`/p/${project.id}/import`);
	}

	async function duplicate(project: Project) {
		await duplicateProject(project.id);
		await refresh();
		toast.success('Project duplicated');
	}

	async function confirmDelete() {
		if (!deleting) return;
		const { id, name } = deleting;
		deleting = null;
		await deleteProject(id);
		await refresh();
		toast.success(`Deleted “${name}”`);
	}

	async function saveName(name: string) {
		if (!renaming) return;
		await renameProject(renaming.id, name);
		renaming = null;
		await refresh();
	}
</script>

<AppHeader title="Projects">
	{#snippet actions()}
		<a
			href="/settings"
			class={buttonVariants({ variant: 'ghost', size: 'icon' })}
			aria-label="Settings"
		>
			<SettingsIcon />
		</a>
	{/snippet}
</AppHeader>

<main class="mx-auto max-w-xl py-4">
	<InstallHint />

	{#if projects === null}
		<p class="px-4 text-sm text-muted-foreground">Loading…</p>
	{:else if projects.length === 0}
		<div class="flex flex-col items-center gap-3 px-6 pt-16 text-center">
			<ImagesIcon class="size-10 text-muted-foreground" aria-hidden="true" />
			<h2 class="text-lg font-semibold">No projects yet</h2>
			<p class="max-w-xs text-sm text-muted-foreground">
				Turn a shoot into a profile grid row and three carousels in four steps.
			</p>
			<GettingStarted current={0} class="mt-2 w-full max-w-xs" />
			<Button class="mt-2" onclick={newProject}><PlusIcon /> New project</Button>
		</div>
	{:else}
		<div class="px-4 pb-3">
			<Button class="w-full" onclick={newProject}><PlusIcon /> New project</Button>
		</div>
		<ul class="flex flex-col gap-2 px-4">
			{#each projects as project (project.id)}
				<li class="flex items-center gap-3 rounded-lg border bg-card p-2">
					<a href="/p/{project.id}" class="flex min-w-0 flex-1 items-center gap-3">
						<div class="grid h-16 w-[3.75rem] shrink-0 grid-cols-3 gap-px overflow-hidden rounded">
							{#each [0, 1, 2] as i (i)}
								{#if project.photoIds[i]}
									<StoredImage photoId={project.photoIds[i]} class="h-full w-full object-cover" />
								{:else}
									<div class="bg-muted"></div>
								{/if}
							{/each}
						</div>
						<div class="min-w-0">
							<p class="truncate font-medium">{project.name}</p>
							<p class="text-xs text-muted-foreground">
								{project.photoIds.length} photo{project.photoIds.length === 1 ? '' : 's'} · edited
								{dateFormat.format(project.updatedAt)}
							</p>
						</div>
					</a>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class={buttonVariants({ variant: 'ghost', size: 'icon' })}
							aria-label="Project options for {project.name}"
						>
							<EllipsisIcon />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onclick={() => (renaming = project)}>Rename</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => duplicate(project)}>Duplicate</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive" onclick={() => (deleting = project)}>
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<RenameDialog
	open={renaming !== null}
	initial={renaming?.name ?? ''}
	onSave={saveName}
	onCancel={() => (renaming = null)}
/>

<AlertDialog.Root open={deleting !== null} onOpenChange={(open) => !open && (deleting = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete “{deleting?.name}”?</AlertDialog.Title>
			<AlertDialog.Description>
				This removes the project and any photos only it uses. Your originals in Photos aren’t
				touched.
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
