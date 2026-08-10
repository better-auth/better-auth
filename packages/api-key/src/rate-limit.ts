import { API_KEY_ERROR_CODES as ERROR_CODES } from ".";
import type { ApiKey } from "./types";

type FixedWindowPolicy = {
	maxRequests: number;
	windowMs: number;
};

/**
 * The atomic action the verify route must apply for the current request, derived
 * from a single read of the API key. The route translates each variant into a
 * guarded storage operation so concurrent verifications cannot exceed the limit.
 */
export type RateLimitDecision =
	| {
			/** Rate limiting does not apply; only stamp `lastRequest`. */
			type: "skip";
			lastRequest: Date | null;
	  }
	| {
			/** Open a window and consume its first request. */
			type: "open";
			now: Date;
			/** The deadline observed when this decision was made; used as a CAS token. */
			observedResetAt: Date | null;
			resetAt: Date;
			policy: FixedWindowPolicy;
	  }
	| {
			/** Within the window and under the max: increment `requestCount` by 1. */
			type: "increment";
			now: Date;
			resetAt: Date;
			policy: FixedWindowPolicy;
	  }
	| {
			/** Within the window and at the max: reject. */
			type: "deny";
			message: string;
			tryAgainIn: number;
	  };

/**
 * Decides how the current request affects the per-key rate-limit counter, based
 * on the read-in-memory ApiKey. The verify route applies the result atomically;
 * this function performs no writes.
 */
export function evaluateRateLimit(
	apiKey: ApiKey,
	opts: { rateLimit: { enabled: boolean } },
	now: Date,
): RateLimitDecision {
	const rateLimitTimeWindow = apiKey.rateLimitTimeWindow;
	const rateLimitMax = apiKey.rateLimitMax;

	if (opts.rateLimit.enabled === false) {
		return { type: "skip", lastRequest: now };
	}

	if (apiKey.rateLimitEnabled === false) {
		return { type: "skip", lastRequest: now };
	}

	if (rateLimitTimeWindow === null || rateLimitMax === null) {
		// Rate limiting is disabled for this key.
		return { type: "skip", lastRequest: null };
	}

	const policy = {
		maxRequests: rateLimitMax,
		windowMs: rateLimitTimeWindow,
	};
	const observedResetAt = apiKey.rateLimitResetAt
		? new Date(apiKey.rateLimitResetAt)
		: null;

	if (observedResetAt === null || now.getTime() >= observedResetAt.getTime()) {
		return {
			type: "open",
			now,
			observedResetAt,
			resetAt: new Date(now.getTime() + rateLimitTimeWindow),
			policy,
		};
	}

	if (apiKey.requestCount >= rateLimitMax) {
		return {
			type: "deny",
			message: ERROR_CODES.RATE_LIMIT_EXCEEDED.message,
			tryAgainIn: observedResetAt.getTime() - now.getTime(),
		};
	}

	return {
		type: "increment",
		now,
		resetAt: observedResetAt,
		policy,
	};
}
