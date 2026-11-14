/** Ask the browser not to evict our data under storage pressure. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
	try {
		if (!navigator.storage?.persist) return false;
		if (await navigator.storage.persisted()) return true;
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}

export interface StorageInfo {
	usage: number;
	quota: number;
	persisted: boolean;
}

export async function storageInfo(): Promise<StorageInfo | null> {
	try {
		if (!navigator.storage?.estimate) return null;
		const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
			navigator.storage.estimate(),
			navigator.storage.persisted?.() ?? Promise.resolve(false)
		]);
		return { usage, quota, persisted };
	} catch {
		return null;
	}
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
