/**
 * Subject detection with MobileCLIP-S0 (Apple). Only the image half of the model runs on the
 * device; the descriptions it is matched against were turned into embeddings ahead of time
 * (text-embeddings.json), so the text half never ships.
 */
import textEmbeddings from './text-embeddings.json';

export type AiBackend = 'webgpu' | 'wasm';

/** Bump when the model, prompts or scoring change, so stored results are recomputed. */
export const SUBJECT_VERSION = 1;

/**
 * The fp16 vision model (22.9 MB) matches full precision exactly; the int8 one is broken
 * (cosine ~0.1 against fp32). Pinned to a revision so it can't change underneath us.
 */
export const MODEL_URL = `https://huggingface.co/${textEmbeddings.model}/resolve/${textEmbeddings.revision}/onnx/vision_model_fp16.onnx`;
export const MODEL_BYTES = 22_876_479;

/** Cache Storage bucket holding the model and the runtime's .wasm file. */
export const AI_CACHE = 'strip-ai';

/** The model's input is a 256×256 RGB crop, values 0..1, no mean/std normalisation. */
export const INPUT_SIZE = 256;

/** CLIP's logit scale: turns cosine similarities into softmax-ready logits. */
const LOGIT_SCALE = 100;

export interface SubjectResult {
	/** 0 = background material (mist, texture, handwriting), 1 = a strong subject. */
	strength: number;
	/** Best-matching descriptions with their share, strongest first. */
	top: { text: string; p: number }[];
}

/** What's stored on each photo. */
export interface SubjectInfo extends SubjectResult {
	version: number;
}

function normalize(v: ArrayLike<number>): Float32Array {
	let n = 0;
	for (let i = 0; i < v.length; i++) n += v[i] * v[i];
	n = Math.sqrt(n) || 1;
	const out = new Float32Array(v.length);
	for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
	return out;
}

const prompts = textEmbeddings.prompts.map((p) => ({ ...p, emb: Float32Array.from(p.emb) }));

/** Zero-shot match of an image embedding against the hero and background descriptions. */
export function scoreEmbedding(raw: ArrayLike<number>): SubjectResult {
	const emb = normalize(raw);
	const logits = prompts.map((p) => {
		let s = 0;
		for (let i = 0; i < emb.length; i++) s += p.emb[i] * emb[i];
		return LOGIT_SCALE * s;
	});
	const max = Math.max(...logits);
	const ex = logits.map((l) => Math.exp(l - max));
	const sum = ex.reduce((a, b) => a + b, 0);
	const probs = ex.map((e) => e / sum);
	const strength = probs.reduce((s, p, i) => s + (prompts[i].group === 'hero' ? p : 0), 0);
	const top = probs
		.map((p, i) => ({ text: prompts[i].text, p }))
		.sort((a, b) => b.p - a.p)
		.slice(0, 3);
	return { strength, top };
}
