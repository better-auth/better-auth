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

function resolveConcurrency(itemCount: number, concurrency: number): number {
	const raw = Math.floor(concurrency);
	return Math.min(itemCount, raw >= 1 ? raw : 1);
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

	const width = resolveConcurrency(n, options.concurrency);
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
 * Like {@link mapConcurrent}, but never fail-fast: every item is attempted
 * (subject to `signal` abort between items). Preserves input order.
 *
 * Use for bulk side effects where partial progress matters more than
 * stopping at the first error (e.g. session token revocation).
 */
export async function mapConcurrentSettled<T, R>(
	items: readonly T[],
	fn: (item: T, index: number) => Awaitable<R>,
	options: MapConcurrentOptions,
): Promise<PromiseSettledResult<R>[]> {
	const n = items.length;
	if (n === 0) return [];

	const { signal } = options;
	if (signal?.aborted) throw signal.reason;

	const width = resolveConcurrency(n, options.concurrency);
	const results = new Array<PromiseSettledResult<R>>(n);
	let idx = 0;
	let aborted: unknown;

	const worker = async (): Promise<void> => {
		while (aborted === undefined && idx < n) {
			if (signal?.aborted) {
				aborted = signal.reason;
				return;
			}
			const i = idx++;
			try {
				results[i] = {
					status: "fulfilled",
					value: await fn(items[i] as T, i),
				};
			} catch (reason) {
				results[i] = { status: "rejected", reason };
			}
		}
	};

	await Promise.all(Array.from({ length: width }, worker));
	if (aborted !== undefined) throw aborted;
	return results;
}

/**
 * Re-throw after a settled concurrent run so callers still observe failure
 * once every item has been attempted.
 */
export function throwIfAnyRejected(
	results: readonly PromiseSettledResult<unknown>[],
	message = "Concurrent operations failed",
): void {
	const reasons = results
		.filter(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		)
		.map((result) => result.reason);
	if (reasons.length === 0) return;
	if (reasons.length === 1) throw reasons[0];
	throw new AggregateError(reasons, message);
}
