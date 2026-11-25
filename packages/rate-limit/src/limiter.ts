import type { RateLimitPolicy } from "./policy";
import type { RateLimitResult } from "./state";
import type { RateLimitStorage } from "./storage/contract";

export type RateLimitConsumeRequest = {
	/** Stable name of the budget within the limiter namespace. */
	scope: string;
	/** Stable identifier of the consumer that owns the budget. */
	key: string;
	policy: RateLimitPolicy;
	cost?: number | undefined;
};

/** A namespaced facade over atomic rate-limit storage. */
export type RateLimiter = {
	consume: (request: RateLimitConsumeRequest) => Promise<RateLimitResult>;
};

export type RateLimiterOptions = {
	/** Stable storage namespace owned by the calling integration. */
	namespace: string;
	storage: RateLimitStorage;
};

/**
 * Creates a limiter whose counters are isolated within one integration-owned
 * namespace. Scopes identify budgets, while keys identify their consumers.
 */
export function createRateLimiter({
	namespace,
	storage,
}: RateLimiterOptions): RateLimiter {
	assertNonEmpty("namespace", namespace);

	return {
		consume({ scope, key, policy, cost }) {
			assertNonEmpty("scope", scope);
			assertNonEmpty("key", key);

			return storage.consume(
				encodeRateLimitStorageKey(namespace, scope, key),
				policy,
				cost === undefined ? undefined : { cost },
			);
		},
	};
}

function encodeRateLimitStorageKey(
	namespace: string,
	scope: string,
	key: string,
): string {
	return `rate-limit:v1:${JSON.stringify([namespace, scope, key])}`;
}

function assertNonEmpty(name: string, value: string): void {
	if (typeof value !== "string" || value.length === 0) {
		throw new TypeError(`${name} must not be empty`);
	}
}
