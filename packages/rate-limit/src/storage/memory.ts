import { evaluateRateLimit } from "../evaluate";
import type { RateLimitState } from "../state";
import type { RateLimitStorage } from "./contract";
import { toRateLimitResult } from "./result";

type MemoryRateLimitEntry = {
	state: RateLimitState;
	expiresAt: number;
};

export type MemoryRateLimitStorageOptions = {
	clock?: (() => number) | undefined;
	maxEntries?: number | undefined;
};

export function createMemoryRateLimitStorage(
	options: MemoryRateLimitStorageOptions = {},
): RateLimitStorage {
	const clock = options.clock ?? Date.now;
	const maxEntries = options.maxEntries ?? 100_000;
	if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
		throw new RangeError("maxEntries must be a positive safe integer");
	}
	const entries = new Map<string, MemoryRateLimitEntry>();

	return {
		async consume(key, policy, consumeOptions) {
			const now = clock();
			const stored = entries.get(key);
			const active = stored && now < stored.expiresAt ? stored : null;
			if (stored && !active) {
				entries.delete(key);
			}

			const evaluation = evaluateRateLimit(
				policy,
				active?.state ?? null,
				now,
				consumeOptions?.cost,
			);
			entries.delete(key);
			if (evaluation.state) {
				if (entries.size >= maxEntries) {
					evictOldestEntry(entries);
				}
				entries.set(key, {
					state: evaluation.state,
					expiresAt: evaluation.resetAt,
				});
			}

			return toRateLimitResult(evaluation);
		},
	};
}

function evictOldestEntry(entries: Map<string, MemoryRateLimitEntry>): void {
	const oldestKey = entries.keys().next().value;
	if (oldestKey !== undefined) {
		entries.delete(oldestKey);
	}
}
