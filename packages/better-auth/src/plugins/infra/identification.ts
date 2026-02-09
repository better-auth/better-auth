/**
 * Identification Service
 *
 * Fetches identification data from the durable-kv service
 * when a request includes an X-Request-Id header.
 */

import { logger } from "better-auth";
import { DASH_KV_URL } from "./constants";
import type { DashOptionsInternal } from "./types";
// ============================================================================
// Types
// ============================================================================

export interface IPLocation {
	lat: number;
	lng: number;
	city: string | null;
	region: string | null;
	postalCode: string | null;
	country: {
		code: string;
		name: string;
	} | null;
	timezone: string | null;
}

export interface Identification {
	visitorId: string;
	requestId: string;
	timestamp: number;
	url: string;
	ip: string | null;
	location: IPLocation | null;
	browser: {
		name: string | null;
		version: string | null;
		os: string | null;
		osVersion: string | null;
		device: string | null;
		userAgent: string | null;
	};
	confidence: number;
	incognito: boolean;
	bot: "notDetected" | "detected" | "unknown";
	isAnonymous: boolean;
}

// ============================================================================
// Cache
// ============================================================================

const identificationCache = new Map<
	string,
	{ data: Identification | null; timestamp: number }
>();
const CACHE_TTL_MS = 60000; // 1 minute
const CACHE_MAX_SIZE = 1000; // Max entries before forced cleanup
let lastCleanup = Date.now();

function cleanupCache() {
	const now = Date.now();
	for (const [key, value] of identificationCache.entries()) {
		if (now - value.timestamp > CACHE_TTL_MS) {
			identificationCache.delete(key);
		}
	}
	lastCleanup = now;
}

// Periodic cleanup - runs on each access if interval passed
function maybeCleanup() {
	const now = Date.now();
	// Clean up every minute or when cache is too large
	if (
		now - lastCleanup > CACHE_TTL_MS ||
		identificationCache.size > CACHE_MAX_SIZE
	) {
		cleanupCache();
	}
}

// ============================================================================
// Fetch Identification
// ============================================================================

/**
 * Fetch identification data from durable-kv by requestId
 */
export async function getIdentification(
	requestId: string,
	apiKey: string,
	kvUrl?: string,
): Promise<Identification | null> {
	// Periodic cleanup
	maybeCleanup();

	// Check cache first
	const cached = identificationCache.get(requestId);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.data;
	}

	const baseUrl = kvUrl || DASH_KV_URL;

	// Retry logic with short delays for 404 (race condition with background processing)
	const maxRetries = 3;
	const retryDelays = [50, 100, 200]; // ms

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetch(`${baseUrl}/identify/${requestId}`, {
				method: "GET",
				headers: {
					"x-api-key": apiKey,
				},
			});

			if (response.ok) {
				const data = (await response.json()) as Identification;
				identificationCache.set(requestId, { data, timestamp: Date.now() });
				return data;
			}

			// On 404, retry a few times (background processing may not be done yet)
			if (response.status === 404 && attempt < maxRetries) {
				await new Promise((resolve) =>
					setTimeout(resolve, retryDelays[attempt]),
				);
				continue;
			}

			// Don't cache null for 404s - it may be a timing issue
			// Only cache null for other errors (like 401/403)
			if (response.status !== 404) {
				identificationCache.set(requestId, {
					data: null,
					timestamp: Date.now(),
				});
			}
			return null;
		} catch (error) {
			if (attempt === maxRetries) {
				logger.error("[Dash] Failed to fetch identification:", error);
				return null;
			}
			// Retry on network errors too
			await new Promise((resolve) =>
				setTimeout(resolve, retryDelays[attempt] || 50),
			);
		}
	}

	return null;
}

/**
 * Extract identification headers from a request
 */
export function extractIdentificationHeaders(request: Request | undefined): {
	visitorId: string | null;
	requestId: string | null;
} {
	if (!request) {
		return { visitorId: null, requestId: null };
	}

	return {
		visitorId: request.headers.get("X-Visitor-Id"),
		requestId: request.headers.get("X-Request-Id"),
	};
}

/**
 * Check if identification indicates a bot
 */
export function isBot(identification: Identification | null): boolean {
	if (!identification) return false;
	return identification.bot === "detected";
}

/**
 * Check if identification indicates an anonymizer service (VPN, proxy, Tor, relay, or hosting)
 */
export function isAnonymous(identification: Identification | null): boolean {
	if (!identification) return false;
	return identification.isAnonymous;
}

/**
 * Get the visitor's location
 */
export function getLocation(
	identification: Identification | null,
): IPLocation | null {
	if (!identification) return null;
	return identification.location;
}

/**
 * Get the visitor's country code
 */
export function getCountryCode(
	identification: Identification | null,
): string | null {
	return identification?.location?.country?.code || null;
}

/**
 * Create an identification service bound to options
 */
export function createIdentificationService(options: DashOptionsInternal) {
	return {
		async getIdentification(requestId: string) {
			return getIdentification(requestId, options.apiKey, options.kvUrl);
		},
		extractIdentificationHeaders,
		isBot,
		isAnonymous,
		getLocation,
		getCountryCode,
	};
}
