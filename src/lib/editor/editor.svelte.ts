import type { Carousel } from '#lib/model/layout.ts';
import { NO_LIMIT, type ElementRef, type WidthLimit } from './ops.ts';

const MAX_HISTORY = 100;

/**
 * Checks a change before it lands: returns the carousel to use (possibly adjusted) or the
 * reason it isn't allowed.
 */
export type EditGuard = (next: Carousel, prev: Carousel) => Carousel | string;

/**
 * Editing state for one carousel: the layout, the selection, crop mode, and undo/redo.
 *
 * Every committed change goes through `apply` (one undo step). Continuous gestures call
 * `beginGesture`, then `preview` on each move, then `endGesture`, so a whole drag is one step.
 */
export class Editor {
	// Raw (not deeply proxied): every edit replaces the whole object, and the pure ops can
	// structuredClone it.
	carousel = $state.raw() as Carousel;
	selection = $state<ElementRef | null>(null);
	cropMode = $state(false);
	canUndo = $state(false);
	canRedo = $state(false);

	#undo: string[] = [];
	#redo: string[] = [];
	#gestureStart: string | null = null;
	/** What the last history change was, so it can be cancelled. */
	#last: 'edit' | 'undo' | 'redo' | null = null;
	#onChange: (c: Carousel) => void;

	/** Optional check on every change (edits, gesture moves, undo and redo). */
	guard: EditGuard | null = null;
	/** Told why a change was turned down by the guard. */
	onRefuse: (reason: string) => void = () => {};

	/** Background width caps (portrait photos), passed to the editing ops. */
	widthLimit: WidthLimit;

	constructor(
		initial: Carousel,
		onChange: (c: Carousel) => void,
		widthLimit: WidthLimit = NO_LIMIT
	) {
		this.carousel = initial;
		this.#onChange = onChange;
		this.widthLimit = widthLimit;
	}

	#snapshot = () => JSON.stringify($state.snapshot(this.carousel));

	/** The guarded version of a change, or null when it's turned down. */
	#check(next: Carousel): Carousel | null {
		if (!this.guard) return next;
		const out = this.guard(next, this.carousel);
		if (typeof out === 'string') {
			this.onRefuse(out);
			return null;
		}
		return out;
	}

	#sync() {
		this.canUndo = this.#undo.length > 0;
		this.canRedo = this.#redo.length > 0;
	}

	#push(snapshot: string) {
		this.#undo.push(snapshot);
		if (this.#undo.length > MAX_HISTORY) this.#undo.shift();
		this.#redo = [];
		this.#sync();
	}

	/** Commit a change as one undo step. */
	apply(change: Carousel) {
		if (change === this.carousel) return;
		const next = this.#check(change);
		if (!next) return;
		this.#push(this.#snapshot());
		this.carousel = next;
		this.#last = 'edit';
		this.#validateSelection();
		this.#onChange(next);
	}

	beginGesture() {
		this.#gestureStart = this.#snapshot();
	}

	/** Update during a gesture without recording history. */
	preview(change: Carousel) {
		const next = this.#check(change);
		if (next) this.carousel = next;
	}

	endGesture() {
		const start = this.#gestureStart;
		this.#gestureStart = null;
		if (start === null || start === this.#snapshot()) return;
		this.#push(start);
		this.#last = 'edit';
		this.#onChange(this.carousel);
	}

	undo() {
		const prev = this.#undo.pop();
		if (prev === undefined) return;
		const next = this.#check(JSON.parse(prev));
		if (!next) {
			this.#undo.push(prev);
			return;
		}
		this.#redo.push(this.#snapshot());
		this.carousel = next;
		this.#last = 'undo';
		this.#afterHistoryMove();
	}

	redo() {
		const saved = this.#redo.pop();
		if (saved === undefined) return;
		const next = this.#check(JSON.parse(saved));
		if (!next) {
			this.#redo.push(saved);
			return;
		}
		this.#undo.push(this.#snapshot());
		this.carousel = next;
		this.#last = 'redo';
		this.#afterHistoryMove();
	}

	/**
	 * Reverse the last change, edit, undo or redo, as if it never happened (a change turned
	 * down at a confirmation). An edit isn't offered for redo afterwards.
	 */
	cancelLast() {
		const last = this.#last;
		this.#last = null;
		const from = last === 'undo' ? this.#redo : this.#undo;
		const prev = from.pop();
		if (!last || prev === undefined) return;
		if (last === 'undo') this.#undo.push(this.#snapshot());
		if (last === 'redo') this.#redo.push(this.#snapshot());
		this.carousel = JSON.parse(prev);
		this.#afterHistoryMove();
	}

	#afterHistoryMove() {
		this.cropMode = false;
		this.#validateSelection();
		this.#sync();
		this.#onChange(this.carousel);
	}

	select(ref: ElementRef | null) {
		if (!sameRef(ref, this.selection)) this.cropMode = false;
		this.selection = ref;
	}

	/** Drop the selection if the element it points at no longer exists. */
	#validateSelection() {
		const s = this.selection;
		if (!s) return;
		const exists =
			s.kind === 'frame'
				? this.carousel.frames.some((f) => f.id === s.id)
				: s.index < this.carousel.backgrounds.length;
		if (!exists) {
			this.selection = null;
			this.cropMode = false;
		}
	}

	get selectedFrame() {
		const s = this.selection;
		return s?.kind === 'frame' ? this.carousel.frames.find((f) => f.id === s.id) : undefined;
	}

	get selectedBackground() {
		const s = this.selection;
		return s?.kind === 'bg' ? this.carousel.backgrounds[s.index] : undefined;
	}
}

export function sameRef(a: ElementRef | null, b: ElementRef | null): boolean {
	if (!a || !b) return a === b;
	if (a.kind === 'frame' && b.kind === 'frame') return a.id === b.id;
	if (a.kind === 'bg' && b.kind === 'bg') return a.index === b.index;
	return false;
}
