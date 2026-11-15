<script lang="ts">
	import type { Photo, PhotoRole } from '#lib/model/types.ts';
	import { isSubjectDetectionOn, SUBJECT_VERSION } from '#lib/ai/prefs.ts';
	import { STRONG_SUBJECT } from '#lib/layout/score.ts';
	import { prominenceOf } from '#lib/layout/types.ts';

	interface Props {
		photo: Photo;
		onChange: (role: PhotoRole | undefined) => void;
	}

	let { photo, onChange }: Props = $props();

	const options: [PhotoRole | undefined, string][] = [
		[undefined, 'Auto'],
		['hero', 'Strong subject'],
		['background', 'Background']
	];

	const detectionOn = isSubjectDetectionOn();
	const id = $props.id();
	const buttons: HTMLButtonElement[] = [];

	const hint = $derived.by(() => {
		if (photo.role === 'hero') return 'Suggestions keep it clear of frames.';
		if (photo.role === 'background') return 'Suggestions may cover it with frames.';
		if (!detectionOn) return 'Decided by the layout rules. Subject detection in Settings can help.';
		if (photo.subject?.version !== SUBJECT_VERSION)
			return 'Subject detection runs when you open suggestions.';
		const label = photo.subject.top[0]?.text;
		if (!label) return 'Subject detection found nothing clear.';
		const p = prominenceOf(photo, true) ?? 0;
		const seen = `Detected “${label}”`;
		if (p >= STRONG_SUBJECT) return `${seen}, so treated as a strong subject.`;
		if (p < 0.3) return `${seen}, so treated as a background.`;
		return `${seen}. It could go either way.`;
	});

	const selectedIndex = $derived(
		Math.max(
			0,
			options.findIndex(([value]) => value === photo.role)
		)
	);

	/** Arrow keys move the choice, as in a native radio group (one Tab stop for the group). */
	function onKeydown(e: KeyboardEvent) {
		const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
		if (!step) return;
		e.preventDefault();
		const next = (selectedIndex + step + options.length) % options.length;
		onChange(options[next][0]);
		buttons[next]?.focus();
	}
</script>

<div class="flex flex-col gap-1.5">
	<span id="{id}-label" class="text-sm font-medium">Use as</span>
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div
		class="flex gap-0.5 rounded-md border p-0.5 text-sm"
		role="radiogroup"
		aria-labelledby="{id}-label"
		tabindex="-1"
		onkeydown={onKeydown}
	>
		{#each options as [value, label], i (label)}
			{@const checked = photo.role === value}
			<button
				bind:this={buttons[i]}
				type="button"
				role="radio"
				aria-checked={checked}
				tabindex={i === selectedIndex ? 0 : -1}
				class="min-h-11 flex-1 rounded px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground {checked
					? 'bg-secondary font-medium text-foreground ring-1 ring-foreground/30'
					: 'text-muted-foreground'}"
				onclick={() => onChange(value)}>{label}</button
			>
		{/each}
	</div>
	<p class="text-xs text-muted-foreground" aria-live="polite">{hint}</p>
</div>
