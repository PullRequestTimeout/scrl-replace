// Downloads the subject-detection model (pinned revision) into fixtures/generated/models/, so
// e2e tests can serve it locally instead of hitting Hugging Face. Git-ignored; tests that need
// it skip when it's absent.  Usage: node scripts/fetch-subject-model.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { model, revision } = JSON.parse(
	readFileSync(resolve('src/lib/ai/text-embeddings.json'), 'utf8')
);
const url = `https://huggingface.co/${model}/resolve/${revision}/onnx/vision_model_fp16.onnx`;
const out = resolve('fixtures/generated/models/vision_model_fp16.onnx');

const res = await fetch(url);
if (!res.ok) throw new Error(`Download failed (${res.status}) from ${url}`);
mkdirSync(resolve('fixtures/generated/models'), { recursive: true });
writeFileSync(out, Buffer.from(await res.arrayBuffer()));
console.log(`Saved ${out}`);
