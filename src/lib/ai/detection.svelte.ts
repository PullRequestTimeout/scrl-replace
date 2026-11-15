/**
 * Subject detection on/off, the device check, and running detection over stored photos.
 * Off by default. Everything here is optional: if anything fails, the app carries on with
 * its rule-based suggestions.
 */
import * as Comlink from 'comlink';
import { db } from '#lib/storage/db.ts';
import type { Photo, PhotoId } from '#lib/model/types.ts';
import {
	AI_CACHE,
	MODEL_BYTES,
	MODEL_URL,
	SUBJECT_VERSION,
	type AiBackend,
	type SubjectInfo
} from './model.ts';
import type { AiWorkerApi } from './ai.worker.ts';
import AiWorker from './ai.worker.ts?worker';

export type DetectionStatus =
	'checking' | 'unsupported' | 'off' | 'downloading' | 'testing' | 'on' | 'too-slow' | 'error';

const PREF_KEY = 'pref:subject-detection';
const BENCH_KEY = 'pref:subject-detection-bench';

/** Above this model time per photo on the speed test, the feature stays off. */
export const SLOW_MS = 1000;
/** Free storage needed before downloading: the model, the runtime and some headroom. */
const NEEDED_BYTES = MODEL_BYTES + 60 * 1024 * 1024;

// The smallest module using a SIMD instruction (from wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([
	0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
	253, 98, 11
]);

function readPref(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writePref(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// Blocked storage: the choice just won't persist.
	}
}

export const hasCurrentSubject = (p: Photo) => p.subject?.version === SUBJECT_VERSION;

/** Why this device can't run detection, or null if it can. */
export async function unsupportedReason(): Promise<string | null> {
	if (typeof WebAssembly !== 'object' || !WebAssembly.validate(SIMD_PROBE)) {
		return 'this browser lacks the WebAssembly features the model needs';
	}
	if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
		return 'this browser can’t run the model in the background';
	}
	if (typeof caches === 'undefined') return 'this browser can’t store the model for offline use';
	try {
		const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
		if (quota && quota - usage < NEEDED_BYTES) return 'there isn’t enough free storage';
	} catch {
		// Can't tell: let the download try.
	}
	return null;
}

async function saveSubjects(results: Record<PhotoId, SubjectInfo>) {
	const tx = (await db()).transaction('photos', 'readwrite');
	for (const [id, subject] of Object.entries(results)) {
		const photo = await tx.store.get(id);
		if (photo) await tx.store.put({ ...photo, subject });
	}
	await tx.done;
}

class SubjectDetection {
	status = $state<DetectionStatus>('checking');
	/** Why it's unsupported, or what went wrong. */
	reason = $state('');
	/** Download progress 0..1. */
	progress = $state(0);
	backend = $state<AiBackend | null>(null);
	/** Model time per photo on the speed test, ms. */
	benchmarkMs = $state<number | null>(null);
	/** True when the model is stored on the device, even if detection is off. */
	downloaded = $state(false);

	#worker: Worker | undefined;
	#api: Comlink.Remote<AiWorkerApi> | undefined;
	#loaded = false;
	#inFlight = new Set<PhotoId>();
	#initPromise: Promise<void> | undefined;

	get enabled() {
		return this.status === 'on';
	}

	#remote(): Comlink.Remote<AiWorkerApi> {
		if (!this.#api) {
			this.#worker = new AiWorker();
			// If iOS kills the worker (usually memory), start fresh next time.
			this.#worker.addEventListener('error', () => this.#dropWorker());
			this.#api = Comlink.wrap<AiWorkerApi>(this.#worker);
		}
		return this.#api;
	}

	#dropWorker() {
		this.#worker?.terminate();
		this.#worker = undefined;
		this.#api = undefined;
		this.#loaded = false;
	}

	/** Check the device and restore the saved choice. Safe to call repeatedly. */
	init(): Promise<void> {
		this.#initPromise ??= (async () => {
			const reason = await unsupportedReason();
			if (reason) {
				this.reason = reason;
				this.status = 'unsupported';
				return;
			}
			const bench = Number(readPref(BENCH_KEY));
			this.benchmarkMs = bench > 0 ? bench : null;
			try {
				// Checked here rather than in the worker, so nothing loads while it's off.
				this.downloaded = !!(await (await caches.open(AI_CACHE)).match(MODEL_URL));
			} catch {
				this.downloaded = false;
			}
			this.status = readPref(PREF_KEY) === 'on' ? 'on' : 'off';
		})();
		return this.#initPromise;
	}

	/** Download (if needed), test the speed, and turn on if this device is fast enough. */
	async enable() {
		await this.init();
		if (this.status === 'unsupported') return;
		this.reason = '';
		this.progress = 0;
		this.status = 'downloading';
		try {
			const api = this.#remote();
			const info = await api.load(
				Comlink.proxy((loaded: number, total: number) => {
					this.progress = loaded / (total || MODEL_BYTES);
				})
			);
			this.#loaded = true;
			this.downloaded = true;
			this.backend = info.backend;
			this.status = 'testing';
			const ms = await api.benchmark();
			this.benchmarkMs = ms;
			writePref(BENCH_KEY, String(Math.round(ms)));
			if (ms > SLOW_MS) {
				this.status = 'too-slow';
				writePref(PREF_KEY, null);
				this.#dropWorker();
				return;
			}
			writePref(PREF_KEY, 'on');
			this.status = 'on';
		} catch (err) {
			this.#dropWorker();
			this.reason =
				typeof navigator !== 'undefined' && !navigator.onLine
					? 'You’re offline. Connect to download the model.'
					: `Couldn’t set it up (${err instanceof Error ? err.message : String(err)}).`;
			this.status = 'error';
		}
	}

	/** Turn off. Stored results and the downloaded model are kept. */
	disable() {
		writePref(PREF_KEY, null);
		this.#dropWorker();
		if (this.status !== 'unsupported') this.status = 'off';
	}

	/** Turn off and delete the downloaded model. */
	async removeModel() {
		this.disable();
		try {
			await caches.delete(AI_CACHE);
		} catch {
			// Nothing stored, or storage blocked.
		}
		this.downloaded = false;
	}

	/**
	 * Score any photos without a current result and store the results. Returns them, or
	 * null when detection is off or failed. Never throws.
	 */
	async ensureSubjects(photos: Photo[]): Promise<Record<PhotoId, SubjectInfo> | null> {
		await this.init();
		if (!this.enabled) return null;
		const todo = photos.filter((p) => !hasCurrentSubject(p) && !this.#inFlight.has(p.id));
		if (!todo.length) return {};
		const ids = todo.map((p) => p.id);
		ids.forEach((id) => this.#inFlight.add(id));
		try {
			const api = this.#remote();
			if (!this.#loaded) {
				const info = await api.load();
				this.#loaded = true;
				this.backend = info.backend;
			}
			const { results } = await api.detect(ids);
			await saveSubjects(results);
			return results;
		} catch (err) {
			console.warn('Subject detection failed', err);
			this.#dropWorker();
			return null;
		} finally {
			ids.forEach((id) => this.#inFlight.delete(id));
		}
	}
}

export const subjectDetection = new SubjectDetection();
