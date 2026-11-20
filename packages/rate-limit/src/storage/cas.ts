import { evaluateRateLimit } from "../evaluate";
import type { RateLimitStateStore, RateLimitStorage } from "./contract";
import { toRateLimitResult } from "./result";

export type CasRateLimitStorageOptions = {
	clock?: (() => number) | undefined;
	maxAttempts?: number | undefined;
};

export function createCasRateLimitStorage<Revision>(
	store: RateLimitStateStore<Revision>,
	options: CasRateLimitStorageOptions = {},
): RateLimitStorage {
	const clock = options.clock ?? Date.now;
	const maxAttempts = options.maxAttempts ?? 10;
	if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
		throw new RangeError("maxAttempts must be a positive safe integer");
	}

	return {
		async consume(key, policy, consumeOptions) {
			for (let attempt = 0; attempt < maxAttempts; attempt++) {
				const snapshot = await store.get(key);
				const evaluation = evaluateRateLimit(
					policy,
					snapshot?.state ?? null,
					clock(),
					consumeOptions?.cost,
				);

				if (!evaluation.allowed || !evaluation.state) {
					return toRateLimitResult(evaluation);
				}

				const updated = await store.compareAndSet(
					key,
					snapshot?.revision ?? null,
					{
						state: evaluation.state,
						expiresAt: evaluation.resetAt,
					},
				);
				if (updated) {
					return toRateLimitResult(evaluation);
				}
			}

			throw new Error(
				`Rate-limit state for key "${key}" remained contended after ${maxAttempts} attempts`,
			);
		},
	};
}
