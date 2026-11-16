<script lang="ts">
	import { untrack } from 'svelte';
	import { GRID_HIDDEN_SIDE, SLIDE_H, SLIDE_W } from '#lib/model/constants.ts';
	import { HEX_COLOUR } from '#lib/model/presets.ts';
	import {
		backgroundInner,
		backgroundRect,
		frameInner,
		frameOuter,
		frameWidth,
		stripWidth,
		type Crop,
		type Rect
	} from '#lib/model/layout.ts';
	import type { Photo, PhotoId } from '#lib/model/types.ts';
	import { drawCarousel, type DrawSource } from '#lib/render/draw.ts';
	import { sameRef, type Editor } from '#lib/editor/editor.svelte.ts';
	import {
		backgroundAt,
		moveJoin,
		resizeFrame,
		setBackgroundCrop,
		setFrameCrop,
		snapFrame,
		snapJoin,
		type ElementRef
	} from '#lib/editor/ops.ts';
	import { panCrop, zoomCrop } from '#lib/editor/crop-gesture.ts';

	export type Zoom = 'overview' | 'slide';

	interface Props {
		editor: Editor;
		photos: Map<PhotoId, Photo>;
		sources: Map<PhotoId, DrawSource>;
		zoom: Zoom;
		showGuides?: boolean;
		/** Tapped an empty background slot. */
		onEmptyTap: (index: number) => void;
		/** Overview tap: switch to slide zoom centred on this strip x. */
		onZoomTo: (x: number) => void;
		/** Strip x at the centre of the view, kept in sync for "add here" actions. */
		centerX?: number;
		emptyFill?: string;
	}

	let {
		editor,
		photos,
		sources,
		zoom,
		showGuides = true,
		onEmptyTap,
		onZoomTo,
		centerX = $bindable(0),
		emptyFill
	}: Props = $props();

	let canvas = $state<HTMLCanvasElement>();
	let cw = $state(0);
	let originX = $state(0);
	let guides = $state<{ axis: 'x' | 'y'; at: number }[]>([]);

	const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
	const carousel = $derived(editor.carousel);
	const W = $derived(stripWidth(carousel));

	/** CSS px per strip px. */
	const scale = $derived.by(() => {
		if (cw <= 0) return 0.1;
		return zoom === 'overview' ? (cw - 24) / W : (cw * 0.78) / SLIDE_W;
	});
	const viewW = $derived(cw / scale);
	const height = $derived(Math.round(SLIDE_H * scale));

	function clampOrigin(x: number): number {
		if (W <= viewW) return -(viewW - W) / 2;
		const pad = 24 / scale;
		return Math.min(Math.max(x, -pad), W - viewW + pad);
	}

	/**
	 * Strip x at the centre of the view. A plain variable (not state) so it always holds the
	 * centre at the *previous* zoom when the zoom changes; reading derived values there would
	 * already use the new scale.
	 */
	let viewCentre = SLIDE_W / 2;
	/** Set by an overview tap: where the next zoom-in should centre. */
	let pendingCentre: number | null = null;

	function setOrigin(x: number) {
		originX = clampOrigin(x);
		viewCentre = originX + viewW / 2;
	}

	// Keep the view centred on the same strip point when the zoom or screen width changes.
	$effect(() => {
		void zoom;
		void cw;
		void scale;
		untrack(() => {
			const target = pendingCentre ?? viewCentre;
			pendingCentre = null;
			setOrigin(target - viewW / 2);
		});
	});

	// Re-clamp when the strip changes length (slides added or removed).
	$effect(() => {
		void W;
		untrack(() => setOrigin(originX));
	});

	// Report the centre to the parent (used to place new frames where you're looking).
	$effect(() => {
		centerX = originX + viewW / 2;
	});

	const toCssX = (x: number) => (x - originX) * scale;
	const toCssY = (y: number) => y * scale;
	const cssRect = (r: Rect) => ({
		x: toCssX(r.x),
		y: toCssY(r.y),
		w: r.w * scale,
		h: r.h * scale
	});

	// ---------------------------------------------------------------------------
	// Drawing

	$effect(() => {
		if (!canvas || cw <= 0) return;
		const pw = Math.round(cw * dpr);
		const ph = Math.round(height * dpr);
		if (canvas.width !== pw) canvas.width = pw;
		if (canvas.height !== ph) canvas.height = ph;
		const ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = '#0a0a0a';
		ctx.fillRect(0, 0, pw, ph);
		drawCarousel(ctx, carousel, (id) => sources.get(id), {
			originX,
			scale: scale * dpr,
			emptyFill
		});
	});

	// ---------------------------------------------------------------------------
	// Overlay geometry

	const selectedRect = $derived.by(() => {
		const s = editor.selection;
		if (!s) return null;
		if (s.kind === 'frame') {
			const f = carousel.frames.find((fr) => fr.id === s.id);
			return f ? frameOuter(f) : null;
		}
		const b = carousel.backgrounds[s.index];
		return b ? backgroundRect(b) : null;
	});

	type Corner = 'tl' | 'tr' | 'bl' | 'br';
	const corners = $derived.by(() => {
		const f = editor.selectedFrame;
		if (!f || editor.cropMode) return [];
		const o = frameOuter(f);
		return [
			{ corner: 'tl' as Corner, x: o.x, y: o.y },
			{ corner: 'tr' as Corner, x: o.x + o.w, y: o.y },
			{ corner: 'bl' as Corner, x: o.x, y: o.y + o.h },
			{ corner: 'br' as Corner, x: o.x + o.w, y: o.y + o.h }
		];
	});

	const joins = $derived(carousel.backgrounds.slice(1).map((b, i) => ({ index: i + 1, x: b.x0 })));
	const JOIN_HANDLE_Y = $derived(height - 22);
	const showJoinHandles = $derived(zoom === 'slide' && !editor.cropMode);

	// ---------------------------------------------------------------------------
	// Hit testing (strip coordinates)

	function frameAt(x: number, y: number): string | null {
		for (let i = carousel.frames.length - 1; i >= 0; i--) {
			const o = frameOuter(carousel.frames[i]);
			if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return carousel.frames[i].id;
		}
		return null;
	}

	const HANDLE_HIT = 22; // css px

	function cornerAt(cssX: number, cssY: number): (typeof corners)[number] | null {
		for (const c of corners) {
			if (Math.hypot(toCssX(c.x) - cssX, toCssY(c.y) - cssY) <= HANDLE_HIT) return c;
		}
		return null;
	}

	function joinAt(cssX: number, cssY: number): number | null {
		if (!showJoinHandles) return null;
		for (const j of joins) {
			if (
				Math.abs(toCssX(j.x) - cssX) <= HANDLE_HIT &&
				Math.abs(JOIN_HANDLE_Y - cssY) <= HANDLE_HIT
			)
				return j.index;
		}
		return null;
	}

	/** The box and photo a crop gesture acts on. */
	function cropTarget(ref: ElementRef | null) {
		if (!ref) return null;
		if (ref.kind === 'frame') {
			const f = carousel.frames.find((fr) => fr.id === ref.id);
			const p = f && photos.get(f.photoId);
			return f && p ? { ref, box: frameInner(f), crop: f.crop, photo: p } : null;
		}
		const b = carousel.backgrounds[ref.index];
		const p = b?.photoId ? photos.get(b.photoId) : undefined;
		return b && p ? { ref, box: backgroundInner(b), crop: b.crop, photo: p } : null;
	}

	function applyCrop(ref: ElementRef, crop: Crop) {
		editor.preview(
			ref.kind === 'frame'
				? setFrameCrop(editor.carousel, ref.id, crop)
				: setBackgroundCrop(editor.carousel, ref.index, crop)
		);
	}

	// ---------------------------------------------------------------------------
	// Gestures

	type Gesture =
		| { kind: 'pan'; startOrigin: number }
		| { kind: 'move'; id: string; fx: number; fy: number }
		| { kind: 'resize'; id: string; corner: Corner; anchor: { x: number; y: number } }
		| { kind: 'join'; index: number }
		| { kind: 'crop'; ref: ElementRef; startCrop: Crop }
		| { kind: 'pinch'; ref: ElementRef; startCrop: Crop; startDist: number };

	const pointers = new Map<number, { x: number; y: number }>();
	let gesture: Gesture | null = null;
	let active = false; // past the movement threshold
	let downAt = { x: 0, y: 0, t: 0 };
	let lastTap = { t: 0, ref: null as ElementRef | null };
	let surface = $state<HTMLDivElement>();

	const TAP_SLOP = 6;

	function local(e: PointerEvent) {
		const r = surface!.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	const toStrip = (p: { x: number; y: number }) => ({ x: originX + p.x / scale, y: p.y / scale });

	function onPointerDown(e: PointerEvent) {
		surface!.setPointerCapture(e.pointerId);
		const p = local(e);
		pointers.set(e.pointerId, p);

		if (pointers.size === 2 && editor.cropMode) {
			const target = cropTarget(editor.selection);
			if (target) {
				editor.beginGesture();
				const [a, b] = [...pointers.values()];
				gesture = {
					kind: 'pinch',
					ref: target.ref,
					startCrop: target.crop,
					startDist: Math.hypot(a.x - b.x, a.y - b.y)
				};
				active = true;
			}
			return;
		}
		if (pointers.size > 1) return;

		downAt = { x: p.x, y: p.y, t: performance.now() };
		active = false;
		const s = toStrip(p);

		if (editor.cropMode) {
			const target = cropTarget(editor.selection);
			const inside =
				target &&
				s.x >= target.box.x &&
				s.x <= target.box.x + target.box.w &&
				s.y >= target.box.y &&
				s.y <= target.box.y + target.box.h;
			gesture = inside
				? { kind: 'crop', ref: target.ref, startCrop: target.crop }
				: { kind: 'pan', startOrigin: originX };
			return;
		}

		const corner = cornerAt(p.x, p.y);
		const f = editor.selectedFrame;
		if (corner && f) {
			const o = frameOuter(f);
			const opposite = { tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' } as const;
			const anchorCorner = opposite[corner.corner];
			const anchor = {
				x: anchorCorner === 'tl' || anchorCorner === 'bl' ? o.x : o.x + o.w,
				y: anchorCorner === 'tl' || anchorCorner === 'tr' ? o.y : o.y + o.h
			};
			gesture = { kind: 'resize', id: f.id, corner: corner.corner, anchor };
			return;
		}

		const join = joinAt(p.x, p.y);
		if (join !== null) {
			gesture = { kind: 'join', index: join };
			return;
		}

		// Only an already-selected frame moves; dragging anywhere else scrolls the strip, so
		// navigating never knocks a frame out of place.
		const id = zoom === 'slide' ? frameAt(s.x, s.y) : null;
		const sel = editor.selection;
		if (id && sel?.kind === 'frame' && sel.id === id) {
			const fr = carousel.frames.find((x) => x.id === id)!;
			gesture = { kind: 'move', id, fx: s.x - fr.x, fy: s.y - fr.y };
			return;
		}
		gesture = { kind: 'pan', startOrigin: originX };
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId) || !gesture) return;
		const p = local(e);
		pointers.set(e.pointerId, p);

		if (gesture.kind === 'pinch') {
			if (pointers.size < 2) return;
			const [a, b] = [...pointers.values()];
			const target = cropTarget(gesture.ref);
			if (!target) return;
			const ratio = Math.hypot(a.x - b.x, a.y - b.y) / gesture.startDist;
			const { photo, box } = target;
			applyCrop(
				gesture.ref,
				zoomCrop(
					photo.width,
					photo.height,
					box.w,
					box.h,
					gesture.startCrop,
					gesture.startCrop.zoom * ratio
				)
			);
			return;
		}

		const dx = p.x - downAt.x;
		const dy = p.y - downAt.y;
		if (!active) {
			if (Math.hypot(dx, dy) < TAP_SLOP) return;
			active = true;
			if (gesture.kind !== 'pan') editor.beginGesture();
			if (gesture.kind === 'move') editor.select({ kind: 'frame', id: gesture.id });
		}

		const s = toStrip(p);
		const threshold = 10 / scale;
		switch (gesture.kind) {
			case 'pan':
				setOrigin(gesture.startOrigin - dx / scale);
				break;
			case 'move': {
				const g = gesture;
				const f = editor.carousel.frames.find((x) => x.id === g.id);
				if (!f) break;
				const snapped = snapFrame(
					editor.carousel,
					f,
					s.x - gesture.fx,
					s.y - gesture.fy,
					threshold
				);
				guides = snapped.guides;
				editor.preview(moveFrameTo(gesture.id, snapped.x, snapped.y));
				autoPan(p.x);
				break;
			}
			case 'resize': {
				const g = gesture;
				const f = editor.carousel.frames.find((x) => x.id === g.id);
				if (!f) break;
				const hFromY = Math.abs(s.y - gesture.anchor.y);
				const wFromX = Math.abs(s.x - gesture.anchor.x);
				const ratio = frameWidth(f) / f.h;
				const h = Math.max(hFromY, wFromX / ratio);
				editor.preview(
					resizeFrame(editor.carousel, gesture.id, h, {
						...gesture.anchor,
						corner: oppositeOf(gesture.corner)
					})
				);
				break;
			}
			case 'join': {
				const snapped = snapJoin(s.x, threshold);
				guides = snapped.snapped ? [{ axis: 'x', at: snapped.x }] : [];
				editor.preview(moveJoin(editor.carousel, gesture.index, snapped.x, editor.widthLimit));
				break;
			}
			case 'crop': {
				const target = cropTarget(gesture.ref);
				if (!target) break;
				const { photo, box } = target;
				applyCrop(
					gesture.ref,
					panCrop(
						photo.width,
						photo.height,
						box.w,
						box.h,
						gesture.startCrop,
						dx / scale,
						dy / scale
					)
				);
				break;
			}
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.delete(e.pointerId);
		const g = gesture;

		if (g?.kind === 'pinch') {
			if (pointers.size === 0) {
				editor.endGesture();
				gesture = null;
			}
			return;
		}
		if (pointers.size > 0) return;
		gesture = null;
		guides = [];

		if (active) {
			if (g && g.kind !== 'pan') editor.endGesture();
			return;
		}
		if (e.type === 'pointercancel') return;
		onTap(local(e));
	}

	function onTap(p: { x: number; y: number }) {
		const s = toStrip(p);
		const inStrip = s.x >= 0 && s.x <= W && s.y >= 0 && s.y <= SLIDE_H;

		if (editor.cropMode) {
			const target = cropTarget(editor.selection);
			const inside =
				target &&
				s.x >= target.box.x &&
				s.x <= target.box.x + target.box.w &&
				s.y >= target.box.y &&
				s.y <= target.box.y + target.box.h;
			if (!inside) editor.cropMode = false;
			return;
		}

		if (zoom === 'overview') {
			if (inStrip) {
				pendingCentre = s.x;
				onZoomTo(s.x);
			}
			return;
		}
		if (!inStrip) {
			editor.select(null);
			return;
		}

		const id = frameAt(s.x, s.y);
		const index = backgroundAt(carousel, s.x);
		const ref: ElementRef = id ? { kind: 'frame', id } : { kind: 'bg', index };

		if (!id && carousel.backgrounds[index]?.photoId === null) {
			editor.select(ref);
			// Open on the next frame: iOS fires its synthetic click after the tap, and if the sheet
			// is already on screen that click lands on its overlay and closes it straight away.
			requestAnimationFrame(() => onEmptyTap(index));
			return;
		}

		const now = performance.now();
		const isDouble = now - lastTap.t < 350 && sameRef(lastTap.ref, ref);
		lastTap = { t: now, ref };
		editor.select(ref);
		if (isDouble) editor.cropMode = true;
	}

	function oppositeOf(c: Corner): Corner {
		return ({ tl: 'br', tr: 'bl', bl: 'tr', br: 'tl' } as const)[c];
	}

	function moveFrameTo(id: string, x: number, y: number) {
		const next = structuredClone($state.snapshot(editor.carousel));
		const f = next.frames.find((fr) => fr.id === id);
		if (!f) return editor.carousel;
		const w = frameWidth(f);
		f.x = Math.min(Math.max(x, 0), W - w);
		f.y = Math.min(Math.max(y, 0), SLIDE_H - f.h);
		return next;
	}

	/** While dragging a frame near the screen edge, scroll the strip along. */
	function autoPan(cssX: number) {
		const edge = 28;
		if (cssX < edge) setOrigin(originX - 12 / scale);
		else if (cssX > cw - edge) setOrigin(originX + 12 / scale);
	}

	// Hint text and outline on empty backgrounds: black or white, whichever contrasts more with
	// the fill (WCAG relative luminance; black wins above L ≈ 0.179).
	const emptyInk = $derived.by(() => {
		const fill = emptyFill && HEX_COLOUR.test(emptyFill) ? emptyFill : '#ffffff';
		const [r, g, b] = [1, 3, 5].map((i) => {
			const c = parseInt(fill.slice(i, i + 2), 16) / 255;
			return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179;
		return { rgb: dark ? '0 0 0' : '255 255 255', outline: dark ? 0.55 : 0.45 };
	});
	const emptyRects = $derived(
		carousel.backgrounds
			.map((b, index) => ({ b, index }))
			.filter(({ b }) => b.photoId === null)
			.map(({ b, index }) => ({ index, r: cssRect(backgroundRect(b)) }))
	);
	const cropRect = $derived.by(() => {
		if (!editor.cropMode) return null;
		const t = cropTarget(editor.selection);
		return t ? cssRect(t.box) : null;
	});
</script>

<div
	bind:this={surface}
	bind:clientWidth={cw}
	class="relative w-full touch-none select-none"
	style="height: {height}px"
	role="application"
	aria-label="Carousel editor. Tap to select, drag frames to move, double-tap to crop."
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	ontouchend={(e) => e.preventDefault()}
>
	<canvas bind:this={canvas} class="absolute inset-0 h-full w-full"></canvas>

	<svg
		class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
		aria-hidden="true"
	>
		<!-- Grid crop guides on slide 1: what the 3:4 profile grid hides. -->
		{#if showGuides}
			{@const hidden = GRID_HIDDEN_SIDE * scale}
			<rect x={toCssX(0)} y="0" width={hidden} {height} fill="rgb(0 0 0 / 0.45)" />
			<rect x={toCssX(SLIDE_W) - hidden} y="0" width={hidden} {height} fill="rgb(0 0 0 / 0.45)" />
		{/if}

		<!-- Slide edges: where Instagram cuts between slides. -->
		{#each { length: carousel.slideCount + 1 }, k (k)}
			<line
				x1={toCssX(k * SLIDE_W)}
				x2={toCssX(k * SLIDE_W)}
				y1="0"
				y2={height}
				stroke="rgb(255 255 255 / 0.55)"
				stroke-width="1"
				stroke-dasharray={k === 0 || k === carousel.slideCount ? '' : '4 4'}
			/>
		{/each}

		{#each emptyRects as { index, r } (index)}
			<rect
				x={r.x + 4}
				y={r.y + 4}
				width={Math.max(0, r.w - 8)}
				height={Math.max(0, r.h - 8)}
				fill="none"
				stroke="rgb({emptyInk.rgb} / {emptyInk.outline})"
				stroke-dasharray="6 6"
				rx="6"
			/>
			{#if zoom === 'slide'}
				<text
					x={r.x + r.w / 2}
					y={r.y + r.h / 2 - 10}
					text-anchor="middle"
					fill="rgb({emptyInk.rgb} / 0.9)"
					font-size="15"
					font-weight="600"
				>
					{index === 0 ? 'Grid tile' : 'Background'}
				</text>
				<text
					x={r.x + r.w / 2}
					y={r.y + r.h / 2 + 12}
					text-anchor="middle"
					fill="rgb({emptyInk.rgb} / 0.8)"
					font-size="13"
				>
					{index === 0 ? 'Tap to choose a portrait photo' : 'Tap to choose a photo'}
				</text>
			{/if}
		{/each}

		{#each guides as g, i (i)}
			{#if g.axis === 'x'}
				<line
					x1={toCssX(g.at)}
					x2={toCssX(g.at)}
					y1="0"
					y2={height}
					stroke="#f59e0b"
					stroke-width="1.5"
				/>
			{:else}
				<line
					x1="0"
					x2={cw}
					y1={toCssY(g.at)}
					y2={toCssY(g.at)}
					stroke="#f59e0b"
					stroke-width="1.5"
				/>
			{/if}
		{/each}

		{#if selectedRect && !editor.cropMode}
			{@const r = cssRect(selectedRect)}
			<rect
				x={r.x}
				y={r.y}
				width={r.w}
				height={r.h}
				fill="none"
				stroke="#38bdf8"
				stroke-width="2"
			/>
			{#each corners as c (c.corner)}
				<circle
					cx={toCssX(c.x)}
					cy={toCssY(c.y)}
					r="8"
					fill="#38bdf8"
					stroke="#0a0a0a"
					stroke-width="2"
				/>
			{/each}
		{/if}

		{#if cropRect}
			<rect
				x={cropRect.x}
				y={cropRect.y}
				width={cropRect.w}
				height={cropRect.h}
				fill="none"
				stroke="#f59e0b"
				stroke-width="2"
				stroke-dasharray="6 4"
			/>
		{/if}

		{#if showJoinHandles}
			{#each joins as j (j.index)}
				<rect
					x={toCssX(j.x) - 6}
					y={JOIN_HANDLE_Y - 14}
					width="12"
					height="28"
					rx="6"
					fill="#ffffff"
					stroke="#0a0a0a"
					stroke-width="2"
				/>
			{/each}
		{/if}
	</svg>
</div>
