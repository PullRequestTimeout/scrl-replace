import { describe, expect, it } from 'vitest';
import { frameWidth, stripWidth, structuralErrors, type Carousel } from '#lib/model/layout.ts';
import {
	addFrame,
	addSlide,
	backgroundToFrame,
	blankCarousel,
	deleteBackground,
	frameToBackground,
	moveFrame,
	moveJoin,
	removeSlide,
	replacePhoto,
	resizeFrame,
	restackFrame,
	setFrameBorder,
	snapFrame,
	snapJoin,
	splitBackground,
	swapPhotos
} from './ops.ts';

function sample(): Carousel {
	return {
		slideCount: 4,
		backgrounds: [
			{ photoId: 'a', x0: 0, x1: 1080, crop: { fx: 0.5, fy: 0.5, zoom: 1 } },
			{ photoId: 'b', x0: 1080, x1: 3000, crop: { fx: 0.5, fy: 0.5, zoom: 1 } },
			{ photoId: 'c', x0: 3000, x1: 4320, crop: { fx: 0.5, fy: 0.5, zoom: 1 } }
		],
		frames: [
			{
				id: 'f1',
				photoId: 'd',
				x: 1500,
				y: 300,
				h: 600,
				aspect: 1.5,
				border: 18,
				crop: { fx: 0.5, fy: 0.5, zoom: 1 }
			}
		]
	};
}

const valid = (c: Carousel) => expect(structuralErrors(c)).toEqual([]);

describe('editing ops', () => {
	it('never mutates the input', () => {
		const c = sample();
		const before = JSON.stringify(c);
		moveFrame(c, 'f1', 10, 10);
		addSlide(c);
		moveJoin(c, 2, 2500);
		expect(JSON.stringify(c)).toBe(before);
	});

	it('clamps frames inside the strip and slide height', () => {
		const c = moveFrame(sample(), 'f1', -500, 2000);
		const f = c.frames[0];
		expect(f.x).toBe(0);
		expect(f.y + f.h).toBe(1350);
		valid(c);
	});

	it('resizes from a corner, keeping the anchor and border proportion', () => {
		const c = sample();
		const f = c.frames[0];
		// Drag the bottom-right corner: top-left stays put.
		const r = resizeFrame(c, 'f1', 900, { x: f.x, y: f.y, corner: 'tl' }).frames[0];
		expect(r.x).toBe(f.x);
		expect(r.y).toBe(f.y);
		expect(r.h).toBe(900);
		expect(r.border).toBe(27);
	});

	it('keeps the frame centre when the border changes', () => {
		const c = sample();
		const cx = c.frames[0].x + frameWidth(c.frames[0]) / 2;
		const r = setFrameBorder(c, 'f1', 40).frames[0];
		expect(r.x + frameWidth(r) / 2).toBeCloseTo(cx);
	});

	it('moves joins within limits and keeps slide 1 a single photo', () => {
		const c = sample();
		expect(moveJoin(c, 1, 500).backgrounds[0].x1).toBe(1080);
		expect(moveJoin(c, 2, 2400).backgrounds[1].x1).toBe(2400);
		expect(moveJoin(c, 2, 99999).backgrounds[2].x0).toBe(4320 - 160);
		valid(moveJoin(c, 2, 2400));
	});

	it('adds and removes slides', () => {
		const added = addSlide(sample());
		expect(stripWidth(added)).toBe(5400);
		// The last photo stays put; the new slide is an empty slot.
		expect(added.backgrounds.map((b) => [b.photoId, b.x0, b.x1])).toEqual([
			['a', 0, 1080],
			['b', 1080, 3000],
			['c', 3000, 4320],
			[null, 4320, 5400]
		]);
		valid(added);
		// Adding again grows the empty slot rather than stacking slots.
		const twice = addSlide(added);
		expect(twice.backgrounds.at(-1)).toMatchObject({ photoId: null, x0: 4320, x1: 6480 });
		expect(twice.backgrounds).toHaveLength(4);

		const removed = removeSlide(sample());
		expect(removed.slideCount).toBe(3);
		// 'c' started at 3000, so it still shows on the new last slide.
		expect(removed.backgrounds.map((b) => [b.photoId, b.x1])).toEqual([
			['a', 1080],
			['b', 3000],
			['c', 3240]
		]);
		valid(removed);
	});

	it('deletes backgrounds by growing a neighbour', () => {
		const c = deleteBackground(sample(), 1);
		expect(c.backgrounds.map((b) => [b.photoId, b.x0, b.x1])).toEqual([
			['a', 0, 3000],
			['c', 3000, 4320]
		]);
		const first = deleteBackground(sample(), 0);
		expect(first.backgrounds[0]).toMatchObject({ photoId: 'b', x0: 0 });
		valid(c);
		valid(first);
	});

	it('splits a background without leaving slivers', () => {
		const c = splitBackground(sample(), 1, 2000, 'z');
		expect(c.backgrounds.map((b) => b.photoId)).toEqual(['a', 'b', 'z', 'c']);
		valid(c);
		// Too close to an edge: the split point is pulled in to leave the minimum width.
		const r = splitBackground(sample(), 1, 1100, 'z');
		expect(r.backgrounds[2].x0).toBe(1080 + 160);
		// A background too narrow to split just takes the photo.
		const narrow = moveJoin(sample(), 2, 1240);
		expect(splitBackground(narrow, 1, 1150, 'z').backgrounds.map((b) => b.photoId)).toEqual([
			'a',
			'z',
			'c'
		]);
		expect(r.backgrounds.map((b) => b.photoId)).toEqual(
			['a', 'b', 'z', 'c']
				.filter((p) => p !== 'b' || false)
				.slice(0, 0)
				.concat(['a', 'b', 'z', 'c'])
		);
	});

	it('converts frames to backgrounds and back', () => {
		const toBg = frameToBackground(sample(), 'f1');
		expect(toBg.frames).toHaveLength(0);
		expect(toBg.backgrounds.map((b) => b.photoId)).toContain('d');
		valid(toBg);

		const toFrame = backgroundToFrame(sample(), 2, 1.5);
		expect(toFrame.backgrounds.map((b) => b.photoId)).toEqual(['a', 'b']);
		expect(toFrame.frames.map((f) => f.photoId)).toEqual(['d', 'c']);
		valid(toFrame);
	});

	it('replaces and swaps photos, adopting the new shape for frames', () => {
		const c = replacePhoto(sample(), { kind: 'frame', id: 'f1' }, 'x', 0.8);
		expect(c.frames[0]).toMatchObject({ photoId: 'x', aspect: 0.8 });
		const s = swapPhotos(sample(), { kind: 'frame', id: 'f1' }, { kind: 'bg', index: 0 }, (id) =>
			id === 'a' ? 0.75 : 1.5
		);
		expect(s.frames[0].photoId).toBe('a');
		expect(s.frames[0].aspect).toBe(0.75);
		expect(s.backgrounds[0].photoId).toBe('d');
	});

	it('restacks frames', () => {
		const two = addFrame(sample(), 'e', 1, 3000);
		const id = two.frames[1].id;
		expect(restackFrame(two, id, -1).frames.map((f) => f.photoId)).toEqual(['e', 'd']);
		expect(restackFrame(two, id, 1)).toBe(two);
	});

	it('starts blank carousels with slide 1 as its own grid-tile slot', () => {
		const blank = blankCarousel(3);
		valid(blank);
		expect(blank.backgrounds.map((b) => [b.photoId, b.x0, b.x1])).toEqual([
			[null, 0, 1080],
			[null, 1080, 3240]
		]);
		expect(blankCarousel(1).backgrounds).toHaveLength(1);

		const tile = replacePhoto(blank, { kind: 'bg', index: 0 }, 'a', 0.8);
		const rest = replacePhoto(tile, { kind: 'bg', index: 1 }, 'b', 1.5);
		const split = splitBackground(rest, 1, 2200, 'c');
		expect(split.backgrounds.map((b) => b.photoId)).toEqual(['a', 'b', 'c']);
		valid(split);
	});
});

describe('snapping', () => {
	it('snaps a frame centre to slide edges and joins', () => {
		const c = sample();
		const f = c.frames[0];
		const w = frameWidth(f);
		const s = snapFrame(c, f, 2160 - w / 2 + 10, 300, 20);
		expect(s.x + w / 2).toBe(2160);
		expect(s.guides).toContainEqual({ axis: 'x', at: 2160 });
		const j = snapFrame(c, f, 3000 - w / 2 - 15, 300, 20);
		expect(j.x + w / 2).toBe(3000);
	});

	it("snaps a frame centre to a slide's vertical centre line", () => {
		const c = sample();
		const f = c.frames[0];
		const w = frameWidth(f);
		const s = snapFrame(c, f, 1080 + 540 - w / 2 - 12, 300, 20);
		expect(s.x + w / 2).toBe(1620);
		expect(s.guides).toContainEqual({ axis: 'x', at: 1620 });
	});

	it('snaps frame edges flush with slide edges', () => {
		const c = sample();
		const f = c.frames[0];
		const w = frameWidth(f);
		// Left edge onto the slide 3 edge.
		const left = snapFrame(c, f, 2160 + 9, 300, 20);
		expect(left.x).toBe(2160);
		expect(left.guides).toContainEqual({ axis: 'x', at: 2160 });
		// Right edge onto the slide 3 edge.
		const right = snapFrame(c, f, 2160 - w - 7, 300, 20);
		expect(right.x + w).toBeCloseTo(2160);
	});

	it('picks the nearest candidate when several are in range', () => {
		const c = sample();
		const f = c.frames[0];
		// 4px from flush-left at 1080, far from everything else.
		expect(snapFrame(c, f, 1084, 300, 20).x).toBe(1080);
	});

	it('snaps vertically to the centre and margins', () => {
		const c = sample();
		const f = c.frames[0];
		expect(snapFrame(c, f, 100, 1350 / 2 - f.h / 2 + 8, 20).y).toBe(1350 / 2 - f.h / 2);
		expect(snapFrame(c, f, 100, 52, 20).y).toBe(40);
	});

	it('snaps joins to slide edges', () => {
		expect(snapJoin(2170, 20)).toEqual({ x: 2160, snapped: true });
		expect(snapJoin(2500, 20)).toEqual({ x: 2500, snapped: false });
	});
});
