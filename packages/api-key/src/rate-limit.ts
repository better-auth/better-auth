import { API_KEY_ERROR_CODES as ERROR_CODES } from ".";
import type { PredefinedApiKeyOptions } from "./routes";
import type { ApiKey } from "./types";

/**
 * The atomic action the verify route must apply for the current request, derived
 * from a single read of the API key. The route translates each variant into a
 * guarded storage operation so concurrent verifications cannot exceed the limit.
 *
 * Uses a **fixed window**: at most `rateLimitMax` successful validations within
 * each `[rateLimitWindowStart, rateLimitWindowStart + rateLimitTimeWindow)`
 * interval. The window start does not move on each request.
 */
export type RateLimitDecision =
	| {
			/** Rate limiting does not apply; only stamp `lastRequest`. */
			type: "skip";
			lastRequest: Date | null;
	  }
	| {
			/** First request in a fresh window: set `requestCount` to 1. */
			type: "start";
			now: Date;
	  }
	| {
			/** Window elapsed: reset `requestCount` to 1, guarded on the window. */
			type: "reset";
			now: Date;
			/** Observed `rateLimitWindowStart`; reset applies only while it still matches. */
			windowStart: Date;
	  }
	| {
			/** Within the window and under the max: increment `requestCount` by 1. */
			type: "increment";
			now: Date;
			max: number;
			/** Observed `rateLimitWindowStart`; increment applies only in this same window. */
			windowStart: Date;
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
 *
 * Fixed-window semantics: `tryAgainIn` is time remaining until
 * `rateLimitWindowStart + rateLimitTimeWindow`, not idle time since `lastRequest`.
 */
export function evaluateRateLimit(
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): RateLimitDecision {
	const now = new Date();
	const nowMs = now.getTime();
	const rateLimitTimeWindow = apiKey.rateLimitTimeWindow;
	const rateLimitMax = apiKey.rateLimitMax;
	const rateLimitWindowStart = apiKey.rateLimitWindowStart;

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

	// No window yet (new key, or counters reset after config change / migration).
	if (rateLimitWindowStart == null) {
		return { type: "start", now };
	}

	const windowStart = new Date(rateLimitWindowStart);
	const windowStartMs = windowStart.getTime();
	const elapsed = nowMs - windowStartMs;

	if (elapsed >= rateLimitTimeWindow) {
		// New window: full quota again until the next boundary.
		return {
			type: "reset",
			now,
			windowStart,
		};
	}

	if (apiKey.requestCount >= rateLimitMax) {
		const windowEndMs = windowStartMs + rateLimitTimeWindow;
		return {
			type: "deny",
			message: ERROR_CODES.RATE_LIMIT_EXCEEDED.message,
			tryAgainIn: Math.max(0, Math.ceil(windowEndMs - nowMs)),
		};
	}

	return {
		type: "increment",
		now,
		max: rateLimitMax,
		windowStart,
	};
}
