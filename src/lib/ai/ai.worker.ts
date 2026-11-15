/**
 * Runs the subject-detection model, kept apart from the image worker so that if iOS kills
 * it for memory, imports and editing carry on.
 *
 * The model and the runtime's .wasm file are kept in Cache Storage after the first download,
 * so detection works offline. Neither is in the service worker's precache: they're only
 * downloaded if subject detection is turned on.
 */
/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import * as ort from 'onnxruntime-web/webgpu';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { getBlob } from '#lib/storage/projects.ts';
import type { PhotoId } from '#lib/model/types.ts';
import {
	AI_CACHE,
	INPUT_SIZE,
	MODEL_URL,
	SUBJECT_VERSION,
	scoreEmbedding,
	type AiBackend,
	type SubjectInfo,
	type SubjectResult
} from './model.ts';

const WASM_URL = new URL(wasmUrl, self.location.href).href;
const FILES = [MODEL_URL, WASM_URL];

// Threads need cross-origin isolation, which the app doesn't have.
ort.env.wasm.numThreads = 1;

let session: ort.InferenceSession | undefined;
let backend: AiBackend | undefined;

export interface LoadInfo {
	backend: AiBackend;
	/** False when anything had to be downloaded. */
	fromCache: boolean;
	ms: number;
}

export type Progress = (loaded: number, total: number) => void;

async function download(url: string, onProgress?: Progress): Promise<Uint8Array<ArrayBuffer>> {
	const res = await fetch(url);
	if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
	const total = Number(res.headers.get('content-length')) || 0;
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let loaded = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.byteLength;
		onProgress?.(loaded, total);
	}
	const out = new Uint8Array(loaded);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.byteLength;
	}
	return out;
}

/** Read a file from the cache, downloading and storing it first if needed. */
async function cached(
	url: string,
	onProgress?: Progress
): Promise<[Uint8Array<ArrayBuffer>, boolean]> {
	const cache = await caches.open(AI_CACHE);
	const hit = await cache.match(url);
	if (hit) return [new Uint8Array(await hit.arrayBuffer()), true];
	const bytes = await download(url, onProgress);
	await cache.put(
		url,
		new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })
	);
	return [bytes, false];
}

/** Drop files left over from earlier app versions (the .wasm name changes with each build). */
async function pruneCache() {
	const cache = await caches.open(AI_CACHE);
	for (const req of await cache.keys()) if (!FILES.includes(req.url)) await cache.delete(req);
}

async function pickBackend(): Promise<AiBackend> {
	try {
		const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
		if (gpu && (await gpu.requestAdapter())) return 'webgpu';
	} catch {
		// No usable GPU: fall back to the CPU.
	}
	return 'wasm';
}

/** Scale to cover 256×256, centre-crop, and lay out as planar RGB 0..1. */
function toInput(bitmap: ImageBitmap): Float32Array {
	const scale = INPUT_SIZE / Math.min(bitmap.width, bitmap.height);
	const tw = Math.round(bitmap.width * scale);
	const th = Math.round(bitmap.height * scale);
	let w = bitmap.width;
	let h = bitmap.height;
	let src: CanvasImageSource = bitmap;
	// Halve in steps so a large source isn't aliased.
	while (w / 2 >= tw) {
		const c = new OffscreenCanvas(Math.round(w / 2), Math.round(h / 2));
		const cx = c.getContext('2d')!;
		cx.imageSmoothingQuality = 'high';
		cx.drawImage(src, 0, 0, c.width, c.height);
		[src, w, h] = [c, c.width, c.height];
	}
	const out = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
	const ctx = out.getContext('2d', { willReadFrequently: true })!;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(src, (INPUT_SIZE - tw) / 2, (INPUT_SIZE - th) / 2, tw, th);
	const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
	const plane = INPUT_SIZE * INPUT_SIZE;
	const chw = new Float32Array(3 * plane);
	for (let i = 0; i < plane; i++) {
		chw[i] = data[i * 4] / 255;
		chw[plane + i] = data[i * 4 + 1] / 255;
		chw[2 * plane + i] = data[i * 4 + 2] / 255;
	}
	return chw;
}

async function infer(input: Float32Array): Promise<Float32Array> {
	if (!session) throw new Error('Model not loaded');
	const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
	const out = await session.run({ [session.inputNames[0]]: tensor });
	return out[session.outputNames[0]].data as Float32Array;
}

async function detectBlob(
	blob: Blob
): Promise<SubjectResult & { prepMs: number; inferMs: number }> {
	const t0 = performance.now();
	const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
	const input = toInput(bitmap);
	bitmap.close();
	const t1 = performance.now();
	const emb = await infer(input);
	return { ...scoreEmbedding(emb), prepMs: t1 - t0, inferMs: performance.now() - t1 };
}

const api = {
	/**
	 * Load the model, downloading what's missing. Progress covers the model (the runtime is
	 * a few MB and arrives alongside it).
	 */
	async load(onProgress?: Progress, force?: AiBackend): Promise<LoadInfo> {
		if (session && backend && (!force || force === backend)) {
			return { backend, fromCache: true, ms: 0 };
		}
		await session?.release();
		session = undefined;
		const t0 = performance.now();
		await pruneCache();
		const [[wasm, wasmHit], [model, modelHit]] = await Promise.all([
			cached(WASM_URL),
			cached(MODEL_URL, onProgress)
		]);
		ort.env.wasm.wasmBinary = wasm;
		backend = force ?? (await pickBackend());
		session = await ort.InferenceSession.create(model, {
			executionProviders: [backend],
			graphOptimizationLevel: 'all'
		});
		return { backend, fromCache: wasmHit && modelHit, ms: performance.now() - t0 };
	},

	/** Median model time over a few runs on a synthetic image, after one warm-up. */
	async benchmark(runs = 3): Promise<number> {
		const input = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
		for (let i = 0; i < input.length; i++) input[i] = Math.random();
		await infer(input);
		const times: number[] = [];
		for (let i = 0; i < runs; i++) {
			const t0 = performance.now();
			await infer(input);
			times.push(performance.now() - t0);
		}
		return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
	},

	/** Score stored photos from their 1024px preview copies. */
	async detect(ids: PhotoId[]): Promise<{ results: Record<PhotoId, SubjectInfo>; ms: number[] }> {
		const results: Record<PhotoId, SubjectInfo> = {};
		const ms: number[] = [];
		for (const id of ids) {
			const blob = await getBlob(id, 'preview');
			if (!blob) continue;
			const { strength, top, prepMs, inferMs } = await detectBlob(blob);
			results[id] = { version: SUBJECT_VERSION, strength, top };
			ms.push(prepMs + inferMs);
		}
		return { results, ms };
	},

	/** Score a picked file directly (test page). */
	detectFile(file: Blob) {
		return detectBlob(file);
	},

	async removeModel(): Promise<void> {
		await session?.release();
		session = undefined;
		backend = undefined;
		await caches.delete(AI_CACHE);
	}
};

export type AiWorkerApi = typeof api;
Comlink.expose(api);
