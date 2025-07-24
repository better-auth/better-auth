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
 *
 * @returns An object indicating whether the request is allowed and, if not,
 *          a message and updated ApiKey data.
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

	// Calculate how many tokens to refill since last request
	const elapsed = now.getTime() - lastRequest.getTime();
	if (refillInterval > 0 && refillAmount > 0) {
		const refills = Math.floor(elapsed / refillInterval);
		if (refills > 0) {
			requestCount = Math.max(0, requestCount - refills * refillAmount);
			requestCount = Math.min(requestCount, rateLimitMax); // cap at max
		}
	}

	if (requestCount >= rateLimitMax) {
		return {
			success: false,
			message: ERROR_CODES.RATE_LIMIT_EXCEEDED,
			update: null,
			tryAgainIn: Math.ceil(rateLimitTimeWindow - elapsed),
		};
	}

	requestCount++;
	return {
		success: true,
		message: null,
		tryAgainIn: null,
		update: { lastRequest: now, requestCount },
	};
}
