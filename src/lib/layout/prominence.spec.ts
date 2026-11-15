import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzePixels } from '#lib/analysis/features.ts';
import { SUBJECT_VERSION } from '#lib/ai/prefs.ts';
import { fitWithin } from '#lib/images/geometry.ts';
import { SLIDE_H, SLIDE_W, WORKING_LONG_EDGE } from '#lib/model/constants.ts';
import { CENTRED, type Carousel } from '#lib/model/layout.ts';
import { DEFAULT_PRESET } from '#lib/model/presets.ts';
import type { Photo } from '#lib/model/types.ts';
import { fixturePixels, fixtureSet, synthetic } from '#lib/testing/fixtures.ts';
import { generateCarousel } from './carousel.ts';
import { assignPhotos } from './assign.ts';
import { HIDDEN_FREE, measureCarousel, STRONG_SUBJECT } from './score.ts';
import { checkCarousel } from './warnings.ts';
import { prominenceOf, type LayoutPhoto } from './types.ts';

const basePhoto = (over: Partial<Photo> = {}): Photo => ({
	id: 'p',
	name: 'p.jpg',
	width: 4000,
	height: 3000,
	workingWidth: 4000,
	workingHeight: 3000,
	importedAt: 0,
	importIndex: 0,
	fileSize: 1,
	analysis: { shot: 'close' } as Photo['analysis'],
	...over
});

describe('prominenceOf', () => {
	const subject = { version: SUBJECT_VERSION, strength: 0.9, top: [] };

	it('lets your tag override everything', () => {
		expect(
			prominenceOf(basePhoto({ role: 'hero', subject: { ...subject, strength: 0 } }), true)
		).toBe(1);
		expect(prominenceOf(basePhoto({ role: 'background', subject }), true)).toBe(0);
		expect(prominenceOf(basePhoto({ role: 'hero' }), false)).toBe(1);
	});

	it('is unknown when detection is off, missing or out of date', () => {
		expect(prominenceOf(basePhoto({ subject }), false)).toBeUndefined();
		expect(prominenceOf(basePhoto(), true)).toBeUndefined();
		expect(prominenceOf(basePhoto({ subject: { ...subject, version: -1 } }), true)).toBeUndefined();
	});

	it('counts a strong subject for less in a wide shot', () => {
		const close = prominenceOf(basePhoto({ subject }), true)!;
		const wide = prominenceOf(
			basePhoto({ subject, analysis: { shot: 'wide' } as Photo['analysis'] }),
			true
		)!;
		expect(close).toBeCloseTo(0.9);
		expect(wide).toBeLessThan(close * 0.7);
	});
});

describe('scoring with subject strength', () => {
	// A landscape background with a bright subject in the middle of slide 2, and a frame on it.
	const pixels = synthetic(256, 171, (x, y) =>
		Math.hypot(x - 128, y - 85) < 30 ? [250, 240, 230] : [40, 60, 45]
	);
	const bgPhoto = (prominence?: number): LayoutPhoto => ({
		id: 'bg',
		width: 6000,
		height: 4000,
		workingWidth: 4096,
		workingHeight: 2731,
		analysis: analyzePixels(pixels),
		importIndex: 0,
		prominence
	});
	const framePhoto: LayoutPhoto = { ...bgPhoto(), id: 'fr', width: 3000, height: 4000 };
	/** Frame on the subject (`onSubject`) or overlapping its edge, so no case hits the ceiling. */
	const carouselWith = (onSubject: boolean): Carousel => ({
		slideCount: 3,
		backgrounds: [
			{ photoId: 'fr', x0: 0, x1: SLIDE_W, crop: { ...CENTRED } },
			{ photoId: 'bg', x0: SLIDE_W, x1: 3 * SLIDE_W, crop: { ...CENTRED } }
		],
		frames: [
			{
				id: 'f1',
				photoId: 'fr',
				x: Math.round(onSubject ? 2 * SLIDE_W - 330 : 2 * SLIDE_W + 120),
				y: 200,
				h: SLIDE_H - 400,
				aspect: 0.75,
				border: 30,
				crop: { ...CENTRED }
			}
		]
	});
	const carousel = carouselWith(false);
	const measure = (prominence?: number) =>
		measureCarousel(
			carousel,
			new Map([
				['bg', bgPhoto(prominence)],
				['fr', framePhoto]
			]),
			DEFAULT_PRESET
		);

	it('makes covering a strong subject cost more than covering background material', () => {
		const weak = measure(0).frames[0].coversSubject;
		const unknown = measure(undefined).frames[0].coversSubject;
		const strong = measure(1).frames[0].coversSubject;
		expect(unknown).toBeGreaterThan(0);
		expect(weak).toBeLessThan(unknown);
		expect(strong).toBeGreaterThan(unknown);
	});

	it('lets weak backgrounds be hidden more, and strong ones less', () => {
		expect(measure(undefined).backgrounds[1].free).toBe(HIDDEN_FREE);
		expect(measure(0).backgrounds[1].free).toBeGreaterThan(HIDDEN_FREE);
		expect(measure(1).backgrounds[1].free).toBeLessThan(HIDDEN_FREE);
	});

	it('only warns about covering a subject (R12) when it is known to be strong', () => {
		const rules = (prominence?: number) =>
			checkCarousel(
				carouselWith(true),
				new Map([
					['bg', bgPhoto(prominence)],
					['fr', framePhoto]
				]),
				DEFAULT_PRESET
			).map((w) => w.rule);
		expect(rules(undefined)).not.toContain('R12');
		expect(rules(0.1)).not.toContain('R12');
		expect(rules(0.95)).toContain('R12');
	});
});

// Real detection scores for the private galleries, from an offline MobileCLIP-S0 run
// (fixtures/generated/subjects.json, git-ignored like the galleries themselves).
const SUBJECTS_FILE = 'fixtures/generated/subjects.json';
const strengths: Record<string, number> = existsSync(SUBJECTS_FILE)
	? JSON.parse(readFileSync(SUBJECTS_FILE, 'utf8'))
	: {};
const SETS = (['og-gallery', 'example-gallery'] as const).filter((s) => fixtureSet(s).length);

describe.skipIf(SETS.length === 0 || !Object.keys(strengths).length)(
	'suggestions with real detection scores',
	() => {
		const SHOT_SCALE = { wide: 0.55, medium: 0.85, close: 1 };
		const load = (withProminence: boolean): LayoutPhoto[] =>
			SETS.flatMap((set) =>
				fixtureSet(set).map((f, i) => {
					const working = fitWithin(
						{ width: f.origWidth, height: f.origHeight },
						WORKING_LONG_EDGE
					);
					const analysis = analyzePixels(fixturePixels(set, f));
					const s = strengths[`${set}/${f.name}`];
					return {
						id: `${set}/${f.name}`,
						width: f.origWidth,
						height: f.origHeight,
						workingWidth: working.width,
						workingHeight: working.height,
						analysis,
						importIndex: i,
						prominence:
							withProminence && s !== undefined ? s * SHOT_SCALE[analysis.shot] : undefined
					};
				})
			);
		const withP = load(true);
		const without = load(false);

		/** Run many seeded carousels over sliding windows of each set. */
		function run(
			photos: LayoutPhoto[],
			visit: (c: Carousel, map: Map<string, LayoutPhoto>) => void
		) {
			const map = new Map(photos.map((p) => [p.id, p]));
			for (const set of SETS) {
				const own = photos.filter((p) => p.id.startsWith(set));
				for (let start = 0; start + 8 <= own.length; start += 3) {
					const [tilePhoto, ...rest] = own.slice(start, start + 8);
					const tile = { photoId: tilePhoto.id, x0: 0, x1: SLIDE_W, crop: { ...CENTRED } };
					for (let seed = 1; seed <= 30; seed++) {
						const c = generateCarousel(
							{ tile, photos: rest, photoMap: map, preset: DEFAULT_PRESET },
							seed
						);
						if (c) visit(c, map);
					}
				}
			}
		}

		it('uses strong subjects as frames more often than background material', () => {
			const asFrame = { weak: 0, strong: 0 };
			const seen = { weak: 0, strong: 0 };
			run(withP, (c, map) => {
				const framed = new Set(c.frames.map((f) => f.photoId));
				for (const id of [...framed, ...c.backgrounds.slice(1).map((b) => b.photoId!)]) {
					const p = map.get(id)!.prominence ?? 0.5;
					const kind = p >= STRONG_SUBJECT ? 'strong' : p < 0.3 ? 'weak' : null;
					if (!kind) continue;
					seen[kind]++;
					if (framed.has(id)) asFrame[kind]++;
				}
			});
			expect(seen.weak).toBeGreaterThan(30);
			expect(asFrame.weak / seen.weak).toBeLessThan(asFrame.strong / seen.strong);
		});

		it('covers strong subjects less than suggestions made without detection', () => {
			const strongMap = new Map(withP.map((p) => [p.id, p]));
			const meanCover = (photos: LayoutPhoto[]) => {
				let sum = 0;
				let n = 0;
				run(photos, (c) => {
					// Always measure against the real strengths, so both runs are judged alike.
					for (const f of measureCarousel(c, strongMap, DEFAULT_PRESET).frames) {
						sum += f.coversStrong;
						n++;
					}
				});
				return sum / n;
			};
			expect(meanCover(withP)).toBeLessThan(meanCover(without));
		});

		it('hides background material more than strong subjects', () => {
			const hidden = { weak: [] as number[], strong: [] as number[] };
			run(withP, (c, map) => {
				const m = measureCarousel(c, map, DEFAULT_PRESET);
				m.backgrounds.slice(1).forEach((b) => {
					const p = map.get(c.backgrounds[b.index].photoId!)!.prominence ?? 0.5;
					if (p >= STRONG_SUBJECT) hidden.strong.push(b.hidden);
					else if (p < 0.3) hidden.weak.push(b.hidden);
				});
			});
			const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
			expect(avg(hidden.weak)).toBeGreaterThan(avg(hidden.strong));
		});

		it('shares strong subjects out across the three carousels', () => {
			const photos = withP.filter((p) => p.id.startsWith('example-gallery'));
			if (photos.length < 12) return;
			const row = {
				mode: 'matched' as const,
				tiles: [photos[0].id, photos[1].id, photos[2].id] as [string, string, string],
				crops: [CENTRED, CENTRED, CENTRED] as const
			};
			const groups = assignPhotos(
				{ ...row, crops: [{ ...CENTRED }, { ...CENTRED }, { ...CENTRED }] },
				photos
			);
			const byId = new Map(photos.map((p) => [p.id, p]));
			const strong = groups.map(
				(g) => g.filter((id) => (byId.get(id)!.prominence ?? 0) >= STRONG_SUBJECT).length
			);
			expect(Math.max(...strong) - Math.min(...strong)).toBeLessThanOrEqual(2);
		});
	}
);
