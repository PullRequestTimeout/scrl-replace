import * as Comlink from 'comlink';
import type { ImageWorkerApi, ProcessedImage } from './image.worker.ts';
import ImageWorker from './image.worker.ts?worker';

let worker: Comlink.Remote<ImageWorkerApi> | undefined;

export function imageWorker(): Comlink.Remote<ImageWorkerApi> {
	worker ??= Comlink.wrap<ImageWorkerApi>(new ImageWorker());
	return worker;
}

/**
 * Process one picked file. Tries decoding in the worker first; if that fails (some formats
 * only decode on the main thread on older iOS), decodes here and transfers the bitmap.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
	try {
		return await imageWorker().processFile(file);
	} catch (workerError) {
		let bitmap: ImageBitmap;
		try {
			bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		} catch {
			throw new Error(`Can't read ${file.name}`, { cause: workerError });
		}
		return imageWorker().processBitmap(Comlink.transfer(bitmap, [bitmap]), file);
	}
}
