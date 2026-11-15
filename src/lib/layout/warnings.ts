/**
 * Live rule checks for the editor (PLAN.md §6.4, §7): the same measurements the scorer uses,
 * turned into a list of specific problems. They never block editing.
 */
import { SLIDE_H, SLIDE_W } from '#lib/model/constants.ts';
import { frameOuter, stripWidth, type Carousel } from '#lib/model/layout.ts';
import type { PhotoId } from '#lib/model/types.ts';
import type { StylePreset } from '#lib/model/presets.ts';
import { MAX_SLIDES } from './carousel.ts';
import { HIDDEN_FREE, measureCarousel } from './score.ts';
import type { LayoutPhoto } from './types.ts';

export const MIN_SLIDES = 3;

/** What a warning points at, so the editor can select it. */
export type WarningTarget = { kind: 'frame'; id: string } | { kind: 'bg'; index: number };

export interface RuleWarning {
	/** Stable per problem, for keyed lists. */
	key: string;
	/** Rule number from PLAN.md §2. */
	rule: string;
	/** Hard rules are ones your posts never break; soft ones are style preferences. */
	level: 'hard' | 'soft';
	message: string;
	target?: WarningTarget;
}

const slideOf = (x: number) => Math.floor(x / SLIDE_W) + 1;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Thresholds above which a measurement counts as a problem worth mentioning. */
const LIMITS = {
	coversSubject: 0.5,
	contrastLuma: 0.1,
	heightOff: 0.06,
	spanOff: 0.1,
	lastSlide: 0.5,
	subjectCut: 0.5,
	// The score measures enlargement at export size (2×); 1 means fewer source pixels than
	// Instagram's 1080 px display, which is when softness actually shows.
	upscale: 1
};

export function checkCarousel(
	c: Carousel,
	photos: Map<PhotoId, LayoutPhoto>,
	preset: StylePreset
): RuleWarning[] {
	const out: RuleWarning[] = [];
	const W = stripWidth(c);
	const frameLabel = new Map(
		[...c.frames]
			.sort((a, b) => a.x - b.x)
			.map((f) => [f.id, `The frame on slide ${slideOf(frameOuter(f).x + frameOuter(f).w / 2)}`])
	);
	const bgLabel = (i: number) =>
		i === 0 ? 'The grid tile' : `The background on slide ${slideOf(c.backgrounds[i].x0 + 1)}`;

	// --- Hard rules -------------------------------------------------------------------------
	if (c.slideCount < MIN_SLIDES)
		out.push({
			key: 'slides-few',
			rule: 'R1',
			level: 'hard',
			message: `Only ${c.slideCount} slide${c.slideCount === 1 ? '' : 's'}: a carousel needs at least ${MIN_SLIDES}.`
		});
	if (c.slideCount > MAX_SLIDES)
		out.push({
			key: 'slides-many',
			rule: 'R1',
			level: 'hard',
			message: `${c.slideCount} slides: Instagram allows at most ${MAX_SLIDES}.`
		});

	c.backgrounds.forEach((b, i) => {
		if (!b.photoId)
			out.push({
				key: `empty-${i}`,
				rule: 'R2',
				level: 'hard',
				message: `${bgLabel(i)} has no photo yet.`,
				target: { kind: 'bg', index: i }
			});
	});

	const outers = c.frames.map((f) => ({ f, o: frameOuter(f) })).sort((a, b) => a.o.x - b.o.x);
	for (const { f, o } of outers) {
		const target: WarningTarget = { kind: 'frame', id: f.id };
		const label = frameLabel.get(f.id)!;
		if (o.x < SLIDE_W - 0.5)
			out.push({
				key: `tile-${f.id}`,
				rule: 'R3',
				level: 'hard',
				message: 'A frame reaches onto slide 1, the grid tile.',
				target
			});
		const margin = preset.frameMargin - 0.5;
		if (o.y < margin || o.y + o.h > SLIDE_H - margin)
			out.push({
				key: `margin-${f.id}`,
				rule: 'R10',
				level: 'hard',
				message: `${label} is closer than ${preset.frameMargin}px to the ${o.y < margin ? 'top' : 'bottom'} of the slide.`,
				target
			});
	}
	for (let i = 1; i < outers.length; i++) {
		const a = outers[i - 1];
		const b = outers[i];
		const gap = b.o.x - (a.o.x + a.o.w);
		const verticalOverlap = a.o.y < b.o.y + b.o.h && b.o.y < a.o.y + a.o.h;
		const minGap = preset.frameGap * SLIDE_W;
		if (gap < 0 && verticalOverlap)
			out.push({
				key: `overlap-${a.f.id}-${b.f.id}`,
				rule: 'R14',
				level: 'hard',
				message: `${frameLabel.get(a.f.id)} overlaps another frame.`,
				target: { kind: 'frame', id: b.f.id }
			});
		else if (gap < minGap - 0.5)
			out.push({
				key: `gap-${a.f.id}-${b.f.id}`,
				rule: 'R14',
				level: 'hard',
				message: `Two frames are only ${Math.max(0, Math.round(gap))}px apart (aim for ${Math.round(minGap)}px).`,
				target: { kind: 'frame', id: b.f.id }
			});
	}

	// --- Soft rules (from the scorer's measurements) ------------------------------------------
	const m = measureCarousel(c, photos, preset);

	for (const j of m.joins) {
		const target: WarningTarget = { kind: 'bg', index: j.index };
		if (j.nearEdge > 0)
			out.push({
				key: `join-edge-${j.index}`,
				rule: 'R6',
				level: 'soft',
				message: `A join is ${Math.round(j.edgeDistance)}px from the slide ${slideOf(j.x)} edge (aim for ${preset.joinClearance}px or right on it).`,
				target
			});
		else if (j.edgeDistance > 2 && !j.covered)
			out.push({
				key: `join-visible-${j.index}`,
				rule: 'R9',
				level: 'soft',
				message: `The join on slide ${slideOf(j.x)} isn’t hidden under a frame.`,
				target
			});
	}

	for (const f of m.frames) {
		const target: WarningTarget = { kind: 'frame', id: f.id };
		const label = frameLabel.get(f.id)!;
		if (f.coversSubject >= LIMITS.coversSubject)
			out.push({
				key: `subject-${f.id}`,
				rule: 'R12',
				level: 'soft',
				message: `${label} covers the subject of the background behind it.`,
				target
			});
		const frame = c.frames.find((x) => x.id === f.id)!;
		if (f.compared && f.contrast < LIMITS.contrastLuma)
			out.push({
				key: `contrast-${f.id}`,
				rule: 'R13',
				level: 'soft',
				message: `${label} doesn’t stand out from its background (same colour or B&W, similar brightness).`,
				target
			});
		if (f.heightOff > LIMITS.heightOff) {
			const h = frame.h / SLIDE_H;
			out.push({
				key: `height-${f.id}`,
				rule: 'R11',
				level: 'soft',
				message: `${label} is ${pct(h)} of the slide height (your style: ${pct(preset.frameHeight[0])}–${pct(preset.frameHeight[1])}).`,
				target
			});
		}
		if (f.upscale >= LIMITS.upscale)
			out.push({
				key: `upscale-f-${f.id}`,
				rule: 'Q',
				level: 'soft',
				message: `${label} has fewer pixels than Instagram shows, so it may look soft.`,
				target
			});
	}

	for (const b of m.backgrounds) {
		const target: WarningTarget = { kind: 'bg', index: b.index };
		if (b.index > 0 && b.hidden > HIDDEN_FREE)
			out.push({
				key: `hidden-${b.index}`,
				rule: 'R17',
				level: 'soft',
				message: `Frames hide ${pct(b.hidden)} of ${bgLabel(b.index).toLowerCase()}.`,
				target
			});
		if (b.spanOff !== null && b.spanOff > LIMITS.spanOff) {
			const bg = c.backgrounds[b.index];
			out.push({
				key: `span-${b.index}`,
				rule: 'R5',
				level: 'soft',
				message: `${bgLabel(b.index)} spans ${((bg.x1 - bg.x0) / SLIDE_W).toFixed(1)} slides, outside your usual range for its shape.`,
				target
			});
		}
		if (b.subjectCut !== null && b.subjectCut >= LIMITS.subjectCut)
			out.push({
				key: `cut-${b.index}`,
				rule: 'R12',
				level: 'soft',
				message: `A slide edge cuts through the subject of ${bgLabel(b.index).toLowerCase()}.`,
				target
			});
		if (b.upscale !== null && b.upscale >= LIMITS.upscale)
			out.push({
				key: `upscale-b-${b.index}`,
				rule: 'Q',
				level: 'soft',
				message: `${bgLabel(b.index)} has fewer pixels than Instagram shows, so it may look soft.`,
				target
			});
	}

	if (m.lastSlideCovered >= LIMITS.lastSlide && c.slideCount > 1)
		out.push({
			key: 'last-slide',
			rule: 'R4',
			level: 'soft',
			message: `Frames cover a lot of the last slide (slide ${slideOf(W - 1)}).`
		});

	m.pairs.forEach((p, i) => {
		if (p.duplicate)
			out.push({
				key: `dup-${i}-${p.a}-${p.b}`,
				rule: 'R16',
				level: 'soft',
				message: 'Two near-identical photos sit next to each other.',
				target: targetForPhoto(c, p.b)
			});
	});

	return out;
}

function targetForPhoto(c: Carousel, id: PhotoId): WarningTarget | undefined {
	const f = c.frames.find((x) => x.photoId === id);
	if (f) return { kind: 'frame', id: f.id };
	const i = c.backgrounds.findIndex((b) => b.photoId === id);
	return i >= 0 ? { kind: 'bg', index: i } : undefined;
}
