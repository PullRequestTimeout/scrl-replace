import type { Carousel } from '#lib/model/layout.ts';
import type { ElementRef } from './ops.ts';

const MAX_HISTORY = 100;

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
	#onChange: (c: Carousel) => void;

	constructor(initial: Carousel, onChange: (c: Carousel) => void) {
		this.carousel = initial;
		this.#onChange = onChange;
	}

	#snapshot = () => JSON.stringify($state.snapshot(this.carousel));

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
	apply(next: Carousel) {
		if (next === this.carousel) return;
		this.#push(this.#snapshot());
		this.carousel = next;
		this.#validateSelection();
		this.#onChange(next);
	}

	beginGesture() {
		this.#gestureStart = this.#snapshot();
	}

	/** Update during a gesture without recording history. */
	preview(next: Carousel) {
		this.carousel = next;
	}

	endGesture() {
		const start = this.#gestureStart;
		this.#gestureStart = null;
		if (start === null || start === this.#snapshot()) return;
		this.#push(start);
		this.#onChange(this.carousel);
	}

	undo() {
		const prev = this.#undo.pop();
		if (prev === undefined) return;
		this.#redo.push(this.#snapshot());
		this.carousel = JSON.parse(prev);
		this.#afterHistoryMove();
	}

	redo() {
		const next = this.#redo.pop();
		if (next === undefined) return;
		this.#undo.push(this.#snapshot());
		this.carousel = JSON.parse(next);
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
