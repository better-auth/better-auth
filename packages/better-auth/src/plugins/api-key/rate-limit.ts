import { ERROR_CODES } from ".";
import type { PredefinedApiKeyOptions } from "./routes";
import type { ApiKey } from "./types";

interface RateLimitResult {
	success: boolean;
	message: string | null;
	tryAgainIn: number | null;
	update: Partial<ApiKey> | null;
}

/**
 * Determines if a request is allowed based on rate limiting parameters.
 */
export function isRateLimited(
	apiKey: ApiKey,
	opts: PredefinedApiKeyOptions,
): RateLimitResult {
	const now = new Date();
	const lastRequest = apiKey.lastRequest ?? now;
	const rateLimitTimeWindow = apiKey.rateLimitTimeWindow;
	const rateLimitMax = apiKey.rateLimitMax;
	const refillAmount = apiKey.refillAmount ?? 0;
	const refillInterval = apiKey.refillInterval ?? 0;
	let requestCount = apiKey.requestCount ?? 0;

	if (opts.rateLimit.enabled === false || apiKey.rateLimitEnabled === false) {
		return {
			success: true,
			message: null,
			update: { lastRequest: now },
			tryAgainIn: null,
		};
	}

	if (rateLimitTimeWindow === null || rateLimitMax === null) {
		return {
			success: true,
			message: null,
			update: null,
			tryAgainIn: null,
		};
	}

	const elapsed = now.getTime() - lastRequest.getTime();

	let updatedLastRequest = lastRequest;

	// Token bucket refill logic
	if (refillInterval > 0 && refillAmount > 0) {
		const refills = Math.floor(elapsed / refillInterval);
		if (refills > 0) {
			requestCount = Math.max(0, requestCount - refills * refillAmount);
			requestCount = Math.min(requestCount, rateLimitMax); // cap at max
			// update the lastRequest to reflect refilled time
			updatedLastRequest = new Date(
				lastRequest.getTime() + refills * refillInterval,
			);
		}
	} else if (elapsed >= rateLimitTimeWindow) {
		// fallback: reset after window
		requestCount = 0;
		updatedLastRequest = now;
	}

	if (requestCount >= rateLimitMax) {
		const retryMs =
			refillInterval > 0
				? refillInterval -
					((now.getTime() - updatedLastRequest.getTime()) % refillInterval)
				: rateLimitTimeWindow - (now.getTime() - updatedLastRequest.getTime());

		return {
			success: false,
			message: ERROR_CODES.RATE_LIMIT_EXCEEDED,
			tryAgainIn: Math.max(0, Math.ceil(retryMs / 1000)),
			update: null,
		};
	}

	// Allow request
	requestCount++;
	return {
		success: true,
		message: null,
		tryAgainIn: null,
		update: { lastRequest: now, requestCount },
	};
}
