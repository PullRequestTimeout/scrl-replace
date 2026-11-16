<script lang="ts">
	import ImagePlusIcon from '@lucide/svelte/icons/image-plus';
	import RectangleHorizontalIcon from '@lucide/svelte/icons/rectangle-horizontal';
	import ReplaceIcon from '@lucide/svelte/icons/replace';
	import ArrowLeftRightIcon from '@lucide/svelte/icons/arrow-left-right';
	import CropIcon from '@lucide/svelte/icons/crop';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import BringToFrontIcon from '@lucide/svelte/icons/bring-to-front';
	import SendToBackIcon from '@lucide/svelte/icons/send-to-back';
	import PanelTopIcon from '@lucide/svelte/icons/panel-top';
	import FrameIcon from '@lucide/svelte/icons/frame';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Slider } from '#lib/components/ui/slider/index.js';
	import type { Editor } from '#lib/editor/editor.svelte.ts';
	import type { Carousel } from '#lib/model/layout.ts';
	import type { Photo, PhotoId } from '#lib/model/types.ts';
	import { CENTRED } from '#lib/model/layout.ts';
	import {
		backgroundToFrame,
		deleteBackground,
		deleteFrame,
		frameToBackground,
		restackFrame,
		setBackgroundBorder,
		setBackgroundCrop,
		setFrameAspect,
		setFrameBorder,
		setFrameCrop,
		addSlide,
		removeSlide
	} from '#lib/editor/ops.ts';
	import { MAX_ZOOM, zoomCrop } from '#lib/editor/crop-gesture.ts';
	import { backgroundInner, frameInner, maxBackgroundBorder } from '#lib/model/layout.ts';
	import { haptic } from '#lib/haptics.ts';

	interface Props {
		editor: Editor;
		photos: Map<PhotoId, Photo>;
		onAddFrame: () => void;
		onReplace: () => void;
		onSwap: () => void;
		/**
		 * Set when slide 1 is a tile of a split row: its edges and border stay fixed, and
		 * `locked` says why it can't change at all (another carousel is locked).
		 */
		panorama?: { locked: string | null } | null;
	}

	let { editor, photos, onAddFrame, onReplace, onSwap, panorama = null }: Props = $props();

	const frame = $derived(editor.selectedFrame);
	const bgIndex = $derived(editor.selection?.kind === 'bg' ? editor.selection.index : -1);
	const bg = $derived(editor.selectedBackground);
	/** Slide 1 of a split row: only Replace, Swap and Crop, which recut all three tiles. */
	const panoramaTile = $derived(bgIndex === 0 && panorama ? panorama : null);
	/** Slide 1 can't change at all: another carousel is locked. */
	const held = $derived(!!panoramaTile?.locked);
	/** Looks disabled but stays focusable, so its explanation is read out. */
	const DIMMED = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

	const SHAPES = [
		{ label: 'Original', value: 0 },
		{ label: '4:5', value: 4 / 5 },
		{ label: '1:1', value: 1 },
		{ label: '3:2', value: 3 / 2 },
		{ label: '2:3', value: 2 / 3 }
	];

	function photoAspect(id: PhotoId | null | undefined): number {
		const p = id ? photos.get(id) : undefined;
		return p ? p.width / p.height : 1;
	}

	// Crop zoom for the crop-mode slider.
	const cropInfo = $derived.by(() => {
		if (!editor.cropMode) return null;
		if (frame) {
			const p = photos.get(frame.photoId);
			return p ? { photo: p, box: frameInner(frame), crop: frame.crop } : null;
		}
		if (bg?.photoId) {
			const p = photos.get(bg.photoId);
			return p ? { photo: p, box: backgroundInner(bg), crop: bg.crop } : null;
		}
		return null;
	});

	/**
	 * Sliders preview live while dragging and commit as a single undo step on release
	 * (keyboard arrows fire change + commit too, so they also work).
	 */
	let sliding = false;
	function slide(next: Carousel) {
		if (!sliding) {
			editor.beginGesture();
			sliding = true;
		}
		editor.preview(next);
	}
	function endSlide() {
		if (!sliding) return;
		sliding = false;
		editor.endGesture();
	}

	function previewCropZoom(zoom: number) {
		const info = cropInfo;
		if (!info) return;
		const crop = zoomCrop(
			info.photo.width,
			info.photo.height,
			info.box.w,
			info.box.h,
			info.crop,
			zoom
		);
		if (frame) slide(setFrameCrop(editor.carousel, frame.id, crop));
		else if (bgIndex >= 0) slide(setBackgroundCrop(editor.carousel, bgIndex, crop));
	}

	function resetCrop() {
		if (frame) editor.apply(setFrameCrop(editor.carousel, frame.id, { ...CENTRED }));
		else if (bgIndex >= 0)
			editor.apply(setBackgroundCrop(editor.carousel, bgIndex, { ...CENTRED }));
	}

	/** 'Original' wins when the photo's own shape equals one of the ratios. */
	function isShape(value: number): boolean {
		if (!frame) return false;
		const original = photoAspect(frame.photoId);
		const matches = (a: number) => Math.abs(frame.aspect - a) < 0.005;
		if (value === 0) return matches(original);
		return !matches(original) && matches(value);
	}
</script>

<div class="flex flex-col gap-3 p-3">
	{#if editor.selection && !editor.cropMode}
		<div class="-mb-1 flex items-center justify-between">
			<span class="text-xs font-medium text-muted-foreground">
				{frame
					? 'Framed photo'
					: bg?.photoId
						? bgIndex === 0
							? 'Background · grid tile'
							: 'Background'
						: 'Empty background'}
			</span>
			<Button size="sm" variant="ghost" onclick={() => editor.select(null)} aria-label="Deselect"
				>Done</Button
			>
		</div>
	{/if}
	{#if editor.cropMode && cropInfo}
		<div class="flex items-center gap-3">
			<span class="w-12 text-xs text-muted-foreground">Zoom</span>
			<Slider
				type="single"
				min={1}
				max={MAX_ZOOM}
				step={0.01}
				value={cropInfo.crop.zoom}
				onValueChange={(v: number) => previewCropZoom(v)}
				onValueCommit={endSlide}
				class="flex-1"
				aria-label="Crop zoom"
			/>
		</div>
		<p class="text-xs text-muted-foreground">Drag the photo to reposition it; pinch to zoom.</p>
		<div class="flex gap-2">
			<Button variant="outline" class="flex-1" onclick={resetCrop}><RotateCcwIcon /> Reset</Button>
			<Button class="flex-1" onclick={() => (editor.cropMode = false)}>Done</Button>
		</div>
	{:else if frame}
		<div class="flex items-center gap-3">
			<span class="w-12 text-xs text-muted-foreground">Border</span>
			<Slider
				type="single"
				min={0}
				max={Math.round(frame.h / 8)}
				step={1}
				value={frame.border}
				onValueChange={(v: number) => slide(setFrameBorder(editor.carousel, frame.id, v))}
				onValueCommit={endSlide}
				class="flex-1"
				aria-label="Border width"
				valueText={(v: number) => `${v} pixels`}
			/>
			<span class="w-10 text-right text-xs tabular-nums">{frame.border}px</span>
		</div>
		<div
			class="flex [scrollbar-width:none] gap-1 overflow-x-auto"
			role="group"
			aria-label="Frame shape"
		>
			{#each SHAPES as shape (shape.label)}
				<Button
					size="sm"
					variant={isShape(shape.value) ? 'secondary' : 'ghost'}
					aria-pressed={!!isShape(shape.value)}
					{@attach haptic}
					onclick={() =>
						editor.apply(
							setFrameAspect(
								editor.carousel,
								frame.id,
								shape.value === 0 ? photoAspect(frame.photoId) : shape.value
							)
						)}>{shape.label}</Button
				>
			{/each}
		</div>
		<div class="grid grid-cols-4 gap-1">
			<Button variant="ghost" class="h-auto flex-col py-2 text-xs" onclick={onReplace}
				><ReplaceIcon />Replace</Button
			>
			<Button variant="ghost" class="h-auto flex-col py-2 text-xs" onclick={onSwap}
				><ArrowLeftRightIcon />Swap</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs"
				onclick={() => (editor.cropMode = true)}><CropIcon />Crop</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs"
				onclick={() =>
					editor.apply(frameToBackground(editor.carousel, frame.id, editor.widthLimit))}
				><PanelTopIcon />To background</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs"
				onclick={() => editor.apply(restackFrame(editor.carousel, frame.id, 1))}
				><BringToFrontIcon />Forward</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs"
				onclick={() => editor.apply(restackFrame(editor.carousel, frame.id, -1))}
				><SendToBackIcon />Backward</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs text-destructive"
				onclick={() => editor.apply(deleteFrame(editor.carousel, frame.id))}
				><Trash2Icon />Delete</Button
			>
		</div>
	{:else if bg && bgIndex >= 0}
		{#if panoramaTile}
			<p id="panorama-note" class="text-xs text-muted-foreground" role="note">
				{panoramaTile.locked ??
					'Slide 1 is part of the split panorama. Replacing, swapping or cropping it changes all three first slides.'}
			</p>
		{:else if bg.photoId}
			{@const maxBorder = maxBackgroundBorder(bg)}
			{@const border = Math.min(bg.border ?? 0, maxBorder)}
			<div class="flex items-center gap-3">
				<span class="w-12 text-xs text-muted-foreground">Border</span>
				<Slider
					type="single"
					min={0}
					max={maxBorder}
					step={1}
					value={border}
					onValueChange={(v: number) => slide(setBackgroundBorder(editor.carousel, bgIndex, v))}
					onValueCommit={endSlide}
					class="flex-1"
					aria-label="Border width"
					valueText={(v: number) => `${v} pixels`}
				/>
				<span class="w-10 text-right text-xs tabular-nums">{border}px</span>
			</div>
		{/if}
		<div class="grid {panoramaTile ? 'grid-cols-3' : 'grid-cols-4'} gap-1">
			<!-- Held back by a lock: still focusable, so VoiceOver reads the note explaining why. -->
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs {DIMMED}"
				aria-disabled={held || undefined}
				aria-describedby={panoramaTile ? 'panorama-note' : undefined}
				onclick={() => !held && onReplace()}
				><ReplaceIcon />{bg.photoId ? 'Replace' : 'Choose'}</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs {DIMMED}"
				disabled={!bg.photoId}
				aria-disabled={held || undefined}
				aria-describedby={panoramaTile ? 'panorama-note' : undefined}
				onclick={() => !held && onSwap()}><ArrowLeftRightIcon />Swap</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs {DIMMED}"
				disabled={!bg.photoId}
				aria-disabled={held || undefined}
				aria-describedby={panoramaTile ? 'panorama-note' : undefined}
				onclick={() => !held && (editor.cropMode = true)}><CropIcon />Crop</Button
			>
			{#if !panoramaTile}
				<Button
					variant="ghost"
					class="h-auto flex-col py-2 text-xs"
					disabled={!bg.photoId || editor.carousel.backgrounds.length < 2}
					onclick={() =>
						editor.apply(
							backgroundToFrame(
								editor.carousel,
								bgIndex,
								photoAspect(bg.photoId),
								editor.widthLimit
							)
						)}><FrameIcon />To frame</Button
				>
				<Button
					variant="ghost"
					class="h-auto flex-col py-2 text-xs text-destructive"
					onclick={() =>
						editor.apply(deleteBackground(editor.carousel, bgIndex, editor.widthLimit))}
					><Trash2Icon />{editor.carousel.backgrounds.length > 1 ? 'Delete' : 'Clear'}</Button
				>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-3 gap-1">
			<Button variant="ghost" class="h-auto flex-col py-2 text-xs" onclick={onAddFrame}
				><ImagePlusIcon />Add frame</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs"
				onclick={() => editor.apply(addSlide(editor.carousel))}><PlusIcon />Add slide</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs"
				disabled={editor.carousel.slideCount <= 1}
				onclick={() => editor.apply(removeSlide(editor.carousel))}><MinusIcon />Remove slide</Button
			>
		</div>
		<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
			<RectangleHorizontalIcon class="size-3.5" aria-hidden="true" />
			Tap a photo to edit it. Drag the white handles at the bottom to move joins.
		</p>
	{/if}
</div>
