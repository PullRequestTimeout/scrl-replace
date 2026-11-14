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
	import type { Photo, PhotoId } from '#lib/model/types.ts';
	import { CENTRED } from '#lib/model/layout.ts';
	import {
		backgroundToFrame,
		deleteBackground,
		deleteFrame,
		frameToBackground,
		restackFrame,
		setBackgroundCrop,
		setFrameAspect,
		setFrameBorder,
		setFrameCrop,
		addSlide,
		removeSlide
	} from '#lib/editor/ops.ts';
	import { MAX_ZOOM, zoomCrop } from '#lib/editor/crop-gesture.ts';
	import { backgroundRect, frameInner } from '#lib/model/layout.ts';

	interface Props {
		editor: Editor;
		photos: Map<PhotoId, Photo>;
		onAddFrame: () => void;
		onReplace: () => void;
		onSwap: () => void;
	}

	let { editor, photos, onAddFrame, onReplace, onSwap }: Props = $props();

	const frame = $derived(editor.selectedFrame);
	const bgIndex = $derived(editor.selection?.kind === 'bg' ? editor.selection.index : -1);
	const bg = $derived(editor.selectedBackground);

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
			return p ? { photo: p, box: backgroundRect(bg), crop: bg.crop } : null;
		}
		return null;
	});

	function setCropZoom(zoom: number) {
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
		if (frame) editor.apply(setFrameCrop(editor.carousel, frame.id, crop));
		else if (bgIndex >= 0) editor.apply(setBackgroundCrop(editor.carousel, bgIndex, crop));
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
				onValueCommit={(v: number) => setCropZoom(v)}
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
				onValueCommit={(v: number) => editor.apply(setFrameBorder(editor.carousel, frame.id, v))}
				class="flex-1"
				aria-label="Border width"
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
				onclick={() => editor.apply(frameToBackground(editor.carousel, frame.id))}
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
		<div class="grid grid-cols-4 gap-1">
			<Button variant="ghost" class="h-auto flex-col py-2 text-xs" onclick={onReplace}
				><ReplaceIcon />{bg.photoId ? 'Replace' : 'Choose'}</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs"
				disabled={!bg.photoId}
				onclick={onSwap}><ArrowLeftRightIcon />Swap</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs"
				disabled={!bg.photoId}
				onclick={() => (editor.cropMode = true)}><CropIcon />Crop</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs"
				disabled={!bg.photoId || editor.carousel.backgrounds.length < 2}
				onclick={() =>
					editor.apply(backgroundToFrame(editor.carousel, bgIndex, photoAspect(bg.photoId)))}
				><FrameIcon />To frame</Button
			>
			<Button
				variant="ghost"
				class="h-auto flex-col py-2 text-xs text-destructive"
				onclick={() => editor.apply(deleteBackground(editor.carousel, bgIndex))}
				><Trash2Icon />{editor.carousel.backgrounds.length > 1 ? 'Delete' : 'Clear'}</Button
			>
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
