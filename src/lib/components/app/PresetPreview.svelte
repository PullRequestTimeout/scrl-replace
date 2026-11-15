<script lang="ts" module>
	export type PreviewKind =
		| 'frameHeight'
		| 'borderRatio'
		| 'frameMargin'
		| 'frameGap'
		| 'bgSpanLandscape'
		| 'bgSpanPortrait'
		| 'bgSpanSquare'
		| 'joinClearance';
</script>

<script lang="ts">
	import { SLIDE_H, SLIDE_W } from '#lib/model/constants.ts';
	import type { StylePreset } from '#lib/model/presets.ts';

	/**
	 * A small diagram of one style setting, drawn in real slide units so its proportions are
	 * exact. Grey boxes with a photo icon stand in for photos: light for backgrounds, darker
	 * with a white border for frames.
	 */
	interface Props {
		kind: PreviewKind;
		preset: StylePreset;
	}

	let { kind, preset }: Props = $props();

	/** Room the diagram may take in the row (CSS px). */
	const BOX_W = 96;
	const BOX_H = 64;
	/** Frames in the diagrams use a 4:5 portrait photo. */
	const FRAME_ASPECT = 0.8;

	interface Box {
		x: number;
		y: number;
		w: number;
		h: number;
	}
	interface FrameBox extends Box {
		border: number;
	}

	/** A frame of outer height `h` centred on `cx`, with the preset's border. */
	function frameAt(cx: number, h: number, cy = SLIDE_H / 2): FrameBox {
		const border = h * preset.borderRatio;
		const w = (h - 2 * border) * FRAME_ASPECT + 2 * border;
		return { x: cx - w / 2, y: cy - h / 2, w, h, border };
	}

	const slides = $derived(
		kind.startsWith('bgSpan') ? 4 : kind === 'borderRatio' || kind === 'frameMargin' ? 1 : 2
	);
	const W = $derived(slides * SLIDE_W);
	const scale = $derived(Math.min(BOX_W / W, BOX_H / SLIDE_H));

	const diagram = $derived.by(() => {
		/** `range`: the stretch a span may reach; `alt`: a second, neighbouring photo. */
		const backgrounds: (Box & { tone?: 'range' | 'alt' })[] = [];
		const frames: FrameBox[] = [];
		const guides: { x1: number; y1: number; x2: number; y2: number }[] = [];
		let join: number | null = null;

		switch (kind) {
			case 'frameHeight': {
				backgrounds.push({ x: 0, y: 0, w: W, h: SLIDE_H });
				const [lo, hi] = preset.frameHeight;
				frames.push(frameAt(SLIDE_W / 2, lo * SLIDE_H), frameAt(SLIDE_W * 1.5, hi * SLIDE_H));
				break;
			}
			case 'borderRatio':
				backgrounds.push({ x: 0, y: 0, w: W, h: SLIDE_H });
				frames.push(frameAt(SLIDE_W / 2, 0.8 * SLIDE_H));
				break;
			case 'frameMargin': {
				backgrounds.push({ x: 0, y: 0, w: W, h: SLIDE_H });
				const m = preset.frameMargin;
				frames.push(frameAt(SLIDE_W / 2, SLIDE_H - 2 * m));
				guides.push(
					{ x1: 0, y1: m, x2: W, y2: m },
					{ x1: 0, y1: SLIDE_H - m, x2: W, y2: SLIDE_H - m }
				);
				break;
			}
			case 'frameGap': {
				backgrounds.push({ x: 0, y: 0, w: W, h: SLIDE_H });
				const gap = preset.frameGap * SLIDE_W;
				const h = 0.45 * SLIDE_H;
				const probe = frameAt(0, h);
				frames.push(
					frameAt(SLIDE_W - gap / 2 - probe.w / 2, h),
					frameAt(SLIDE_W + gap / 2 + probe.w / 2, h)
				);
				break;
			}
			case 'bgSpanLandscape':
			case 'bgSpanPortrait':
			case 'bgSpanSquare': {
				const [lo, hi] = preset[kind];
				backgrounds.push(
					{ x: 0, y: 0, w: hi * SLIDE_W, h: SLIDE_H, tone: 'range' },
					{ x: 0, y: 0, w: lo * SLIDE_W, h: SLIDE_H }
				);
				break;
			}
			case 'joinClearance': {
				join = SLIDE_W + preset.joinClearance;
				backgrounds.push(
					{ x: 0, y: 0, w: join, h: SLIDE_H },
					{ x: join, y: 0, w: W - join, h: SLIDE_H, tone: 'alt' }
				);
				break;
			}
		}
		return { backgrounds, frames, guides, join };
	});

	interface Icon {
		x: number;
		y: number;
		s: number;
	}
	const overlaps = (a: Box, b: Box) =>
		a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

	/** A photo glyph centred in a box: a fixed on-screen size, shrunk to fit small boxes. */
	function centredIcon(b: Box): Icon | null {
		const s = Math.min(14 / scale, b.w * 0.6, b.h * 0.6);
		return s > 4 / scale ? { x: b.x + b.w / 2 - s / 2, y: b.y + b.h / 2 - s / 2, s } : null;
	}

	/**
	 * A background's glyph. Behind frames it moves to the top-left corner, and is left out
	 * where a frame would cover it.
	 */
	function backgroundIcon(b: Box): Icon | null {
		if (!diagram.frames.length) return centredIcon(b);
		const pad = 3 / scale;
		const icon = { x: b.x + pad, y: b.y + pad, s: 9 / scale };
		const area = { x: icon.x - pad, y: icon.y - pad, w: icon.s + 2 * pad, h: icon.s + 2 * pad };
		return diagram.frames.some((f) => overlaps(f, area)) ? null : icon;
	}
</script>

{#snippet photoIcon(icon: Icon | null, onFrame = false)}
	{#if icon}
		<g
			transform="translate({icon.x} {icon.y}) scale({icon.s / 24})"
			class="fill-none {onFrame
				? 'stroke-neutral-100'
				: 'stroke-neutral-500 dark:stroke-neutral-400'}"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<circle cx="9" cy="9" r="2" />
			<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
		</g>
	{/if}
{/snippet}

<svg
	width={Math.round(W * scale)}
	height={Math.round(SLIDE_H * scale)}
	viewBox="0 0 {W} {SLIDE_H}"
	class="shrink-0 overflow-visible rounded-[3px]"
	aria-hidden="true"
>
	<rect width={W} height={SLIDE_H} class="fill-muted" />
	{#each diagram.backgrounds as b, i (i)}
		<rect
			x={b.x}
			y={b.y}
			width={b.w}
			height={b.h}
			class={b.tone === 'range'
				? 'fill-neutral-300/50 stroke-neutral-500 dark:fill-neutral-700/50 dark:stroke-neutral-400'
				: b.tone === 'alt'
					? 'fill-neutral-200 dark:fill-neutral-800'
					: 'fill-neutral-300 dark:fill-neutral-700'}
			stroke-width={b.tone === 'range' ? 1 : 0}
			stroke-dasharray="2 2"
			vector-effect="non-scaling-stroke"
		/>
		{#if b.tone !== 'range'}{@render photoIcon(backgroundIcon(b))}{/if}
	{/each}

	<!-- Slide edges -->
	{#each { length: slides - 1 }, k (k)}
		<line
			x1={(k + 1) * SLIDE_W}
			x2={(k + 1) * SLIDE_W}
			y1="0"
			y2={SLIDE_H}
			class="stroke-background"
			stroke-width="1.5"
			stroke-dasharray="3 2"
			vector-effect="non-scaling-stroke"
		/>
	{/each}

	{#if diagram.join !== null}
		<line
			x1={diagram.join}
			x2={diagram.join}
			y1="0"
			y2={SLIDE_H}
			class="stroke-primary"
			stroke-width="1.5"
			vector-effect="non-scaling-stroke"
		/>
	{/if}

	{#each diagram.guides as g, i (i)}
		<line
			{...g}
			class="stroke-primary"
			stroke-width="1"
			stroke-dasharray="2 2"
			vector-effect="non-scaling-stroke"
		/>
	{/each}

	{#each diagram.frames as f, i (i)}
		{@const inner = {
			x: f.x + f.border,
			y: f.y + f.border,
			w: f.w - 2 * f.border,
			h: f.h - 2 * f.border
		}}
		<rect x={f.x} y={f.y} width={f.w} height={f.h} fill="white" />
		<rect
			x={inner.x}
			y={inner.y}
			width={inner.w}
			height={inner.h}
			class="fill-neutral-400 dark:fill-neutral-500"
		/>
		{@render photoIcon(centredIcon(inner), true)}
	{/each}
</svg>
