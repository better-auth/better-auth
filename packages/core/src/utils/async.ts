import type { Awaitable } from "../types/helper.js";

export interface MapConcurrentOptions {
	/**
	 * Max in-flight mappers. Non-integer values are floored, then clamped
	 * to the range `[1, items.length]`. `NaN` falls back to 1.
	 */
	concurrency: number;
	/**
	 * Rejects with `signal.reason` when aborted. In-flight mappers keep
	 * running but their results are not returned.
	 */
	signal?: AbortSignal;
}

/**
 * Run an async mapper over items with bounded concurrency.
 * Preserves input order in the result. Fails fast on the first rejection.
 */
export async function mapConcurrent<T, R>(
	items: readonly T[],
	fn: (item: T, index: number) => Awaitable<R>,
	options: MapConcurrentOptions,
): Promise<R[]> {
	const n = items.length;
	if (n === 0) return [];

	const { signal } = options;
	if (signal?.aborted) throw signal.reason;

	const raw = Math.floor(options.concurrency);
	const width = Math.min(n, raw >= 1 ? raw : 1);

	const results = new Array<R>(n);
	let idx = 0;
	let failed = false;

	const worker = async (): Promise<void> => {
		while (!failed && idx < n) {
			if (signal?.aborted) throw signal.reason;
			const i = idx++;
			try {
				results[i] = await fn(items[i] as T, i);
			} catch (error) {
				failed = true;
				throw error;
			}
		}
	};

	await Promise.all(Array.from({ length: width }, worker));
	return results;
}
