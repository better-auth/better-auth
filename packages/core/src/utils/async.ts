import type { Awaitable } from "../types/helper";

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

/**
 * How long a caller waits on a pending cached result, such as initialization
 * or a schema lookup, before it evicts that result as abandoned.
 *
 * A runtime that ends I/O with the request that started it, such as the
 * Workers runtime, drops a pending promise once that request responds. It
 * neither resolves nor rejects it, so a cached promise would otherwise stall
 * every later caller in the isolate.
 *
 * @see https://github.com/better-auth/better-auth/issues/10315
 */
export const EVICTION_TIMEOUT_MS = 30_000;

/**
 * Settles like `promise`, unless `deadlineMs` (a `Date.now()` timestamp)
 * passes first. Then it settles like `onDeadline`.
 *
 * A runtime that refuses the timer leaves `promise` unbounded.
 */
export function settleByDeadline<T>(
	promise: Promise<T>,
	deadlineMs: number,
	onDeadline: () => T,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			timer = setTimeout(
				() => {
					try {
						resolve(onDeadline());
					} catch (error) {
						reject(error);
					}
				},
				Math.max(0, deadlineMs - Date.now()),
			);
		} catch {
			// The Workers runtime refuses timers at global scope. No request
			// exists there to abandon the promise, so it needs no bound.
		}
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}
