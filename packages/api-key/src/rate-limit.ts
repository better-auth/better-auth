import { API_KEY_ERROR_CODES as ERROR_CODES } from ".";
import type { PredefinedApiKeyOptions } from "./routes";
import type { ApiKey } from "./types";

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
			/** First request in a fresh window: set `requestCount` to 1 and stamp `lastRequest` as the window's opening time. */
			type: "start";
			now: Date;
	  }
	| {
			/** Window elapsed: reset `requestCount` to 1, guarded on the window. */
			type: "reset";
			now: Date;
			/** `lastRequest` must still predate this instant for the reset to apply. */
			windowStart: Date;
	  }
	| {
			/** Within the window and under the max: increment `requestCount` by 1. */
			type: "increment";
			now: Date;
			max: number;
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
 * The window is a fixed window anchored at the request that opened it:
 * `lastRequest` holds the opening time, allowed requests inside the window do
 * not move it, and the count resets once `rateLimitTimeWindow` has elapsed
 * since that opening request. A key under steady traffic below `rateLimitMax`
 * therefore never sees `RATE_LIMITED` (the window used to slide forward with
 * every allowed request, requiring a full window of silence before it reset).
 */
export function evaluateRateLimit(
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): RateLimitDecision {
	const now = new Date();
	const lastRequest = apiKey.lastRequest;
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

	if (lastRequest === null) {
		return { type: "start", now };
	}

	const timeSinceLastRequest = now.getTime() - new Date(lastRequest).getTime();

	// `>=` (not `>`) so the window is exactly `rateLimitTimeWindow` long and
	// the guarded reset below succeeds at the seam: the reset guard requires
	// `lastRequest <= windowStart`, which holds at equality. A strict `>` here
	// would leave the increment guard (`lastRequest > windowStart`) unsatisfiable
	// for the anchoring request and retry forever at the window's end.
	if (timeSinceLastRequest >= rateLimitTimeWindow) {
		return {
			type: "reset",
			now,
			windowStart: new Date(now.getTime() - rateLimitTimeWindow),
		};
	}

	if (apiKey.requestCount >= rateLimitMax) {
		// The window is anchored at `lastRequest`, so the wait is the time
		// left in that window, not the time since the latest allowed request.
		return {
			type: "deny",
			message: ERROR_CODES.RATE_LIMIT_EXCEEDED.message,
			tryAgainIn: Math.ceil(rateLimitTimeWindow - timeSinceLastRequest),
		};
	}

	return {
		type: "increment",
		now,
		max: rateLimitMax,
		windowStart: new Date(now.getTime() - rateLimitTimeWindow),
	};
}
