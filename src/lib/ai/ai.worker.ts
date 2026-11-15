/**
 * Runs the subject-detection model, kept apart from the image worker so that if iOS kills
 * it for memory, imports and editing carry on.
 */
import * as Comlink from 'comlink';
import * as ort from 'onnxruntime-web/webgpu';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import {
	INPUT_SIZE,
	MODEL_URLS,
	scoreEmbedding,
	type AiBackend,
	type AiPrecision,
	type SubjectResult
} from './model.ts';

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// Threads need cross-origin isolation, which the app doesn't have.
ort.env.wasm.numThreads = 1;

let session: ort.InferenceSession | undefined;

export interface LoadInfo {
	backend: AiBackend;
	downloadMs: number;
	createMs: number;
	bytes: number;
}

export interface EmbedResult extends SubjectResult {
	prepMs: number;
	inferMs: number;
}

/** Downscale in halving steps so the 256px input isn't aliased. */
function toInput(bitmap: ImageBitmap): Float32Array {
	const scale = INPUT_SIZE / Math.min(bitmap.width, bitmap.height);
	const tw = Math.round(bitmap.width * scale);
	const th = Math.round(bitmap.height * scale);
	let w = bitmap.width;
	let h = bitmap.height;
	let src: CanvasImageSource = bitmap;
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

const api = {
	async load(backend: AiBackend, precision: AiPrecision): Promise<LoadInfo> {
		await session?.release();
		session = undefined;
		const t0 = performance.now();
		const res = await fetch(MODEL_URLS[precision]);
		if (!res.ok) throw new Error(`Model download failed (${res.status})`);
		const bytes = new Uint8Array(await res.arrayBuffer());
		const t1 = performance.now();
		session = await ort.InferenceSession.create(bytes, {
			executionProviders: [backend],
			graphOptimizationLevel: 'all'
		});
		return {
			backend,
			downloadMs: t1 - t0,
			createMs: performance.now() - t1,
			bytes: bytes.byteLength
		};
	},

	async embed(file: Blob): Promise<EmbedResult> {
		if (!session) throw new Error('Model not loaded');
		const t0 = performance.now();
		const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		const input = toInput(bitmap);
		bitmap.close();
		const t1 = performance.now();
		const feeds = {
			[session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE])
		};
		const out = await session.run(feeds);
		const t2 = performance.now();
		const emb = out[session.outputNames[0]].data as Float32Array;
		return { ...scoreEmbedding(emb), prepMs: t1 - t0, inferMs: t2 - t1 };
	},

	async info() {
		return {
			inputNames: session?.inputNames ?? [],
			outputNames: session?.outputNames ?? [],
			crossOriginIsolated: self.crossOriginIsolated,
			webgpu: 'gpu' in navigator
		};
	}
};

export type AiWorkerApi = typeof api;
Comlink.expose(api);
