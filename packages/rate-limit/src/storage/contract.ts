import type { RateLimitPolicy } from "../policy";
import type { RateLimitResult, RateLimitState } from "../state";

export type RateLimitConsumeOptions = {
	cost?: number | undefined;
};

/**
 * Atomic persistence boundary for rate-limit enforcement.
 *
 * Implementations must load state, evaluate the policy, and persist the next
 * state as one atomic operation or an equivalent compare-and-swap loop.
 */
export interface RateLimitStorage {
	consume: (
		key: string,
		policy: RateLimitPolicy,
		options?: RateLimitConsumeOptions | undefined,
	) => Promise<RateLimitResult>;
}

export type RateLimitStateSnapshot<Revision> = {
	state: RateLimitState;
	revision: Revision;
};

export type RateLimitStateWrite = {
	state: RateLimitState;
	expiresAt: number;
};

/**
 * Optional portable primitive for stores that can atomically compare and
 * replace opaque state, such as a database row with a revision column.
 */
export interface RateLimitStateStore<Revision> {
	/** Returns null when the key is missing or its state has expired. */
	get: (key: string) => Promise<RateLimitStateSnapshot<Revision> | null>;
	/**
	 * Replaces state only when its revision matches. A null expected revision
	 * succeeds only when the key has no active state, including an expired row.
	 */
	compareAndSet: (
		key: string,
		expectedRevision: Revision | null,
		value: RateLimitStateWrite,
	) => Promise<boolean>;
}
