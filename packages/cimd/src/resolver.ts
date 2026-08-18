import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type {
	OAuthClientMetadata,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import { toExpJWT } from "better-auth/plugins";
import { APIError } from "better-call";
import type { MetadataDocumentResponseCacheHeaders } from "./client-store";
import {
	fetchClientMetadataDocument,
	persistMetadataDocumentClient,
} from "./client-store";
import type { CimdOptions } from "./types";
import { isCimdClientIdUrlCandidate } from "./validate-metadata-document";

const FETCH_BUDGET_WINDOW_MS = 60_000;
const DEFAULT_METADATA_FETCH_POLICY = {
	minimumFetchInterval: 1,
	maximumConcurrentFetches: 16,
	maximumConcurrentFetchesPerOrigin: 4,
	maximumFetchesPerMinute: 120,
	maximumFetchesPerOriginPerMinute: 30,
} as const;

type CimdResolver = (
	ctx: GenericEndpointContext,
	clientId: string,
	existing: SchemaClient<Scope[]> | null,
) => Promise<SchemaClient<Scope[]> | null>;

interface CimdMetadataCacheEntry {
	metadata: OAuthClientMetadata;
	expiresAt: number;
	etag?: string;
	lastModified?: string;
	responseCacheHeaders: MetadataDocumentResponseCacheHeaders;
}

interface ResolvedMetadataFetchPolicy {
	minimumFetchIntervalMs: number;
	maximumConcurrentFetches: number;
	maximumConcurrentFetchesPerOrigin: number;
	maximumFetchesPerMinute: number;
	maximumFetchesPerOriginPerMinute: number;
}

interface OriginFetchState {
	activeFetchCount: number;
	fetchStartTimesMs: number[];
}

function invalidClient(description: string): APIError {
	return new APIError("BAD_REQUEST", {
		error: "invalid_client",
		error_description: description,
	});
}

function createMetadataFetchUnavailableError(description: string): APIError {
	return new APIError("TOO_MANY_REQUESTS", {
		error: "temporarily_unavailable",
		error_description: description,
	});
}

function parseDurationMs(value: number | string, optionName: string): number {
	if (typeof value === "number") {
		if (!Number.isFinite(value) || value < 0) {
			throw new BetterAuthError(
				`cimd metadataFetchPolicy.${optionName} must be a non-negative number of seconds or duration string`,
			);
		}
		return value * 1000;
	}
	try {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const durationMs = (toExpJWT(value, nowSeconds) - nowSeconds) * 1000;
		if (!Number.isFinite(durationMs) || durationMs < 0) {
			throw new Error("negative duration");
		}
		return durationMs;
	} catch {
		throw new BetterAuthError(
			`cimd metadataFetchPolicy.${optionName} must be a non-negative number of seconds or duration string`,
		);
	}
}

function requirePositiveInteger(value: number, optionName: string): number {
	if (!Number.isInteger(value) || value < 1) {
		throw new BetterAuthError(
			`cimd metadataFetchPolicy.${optionName} must be a positive integer`,
		);
	}
	return value;
}

function resolveMetadataFetchPolicy(
	options: CimdOptions,
): ResolvedMetadataFetchPolicy {
	const policy = options.metadataFetchPolicy;
	return {
		minimumFetchIntervalMs: parseDurationMs(
			policy?.minimumFetchInterval ??
				DEFAULT_METADATA_FETCH_POLICY.minimumFetchInterval,
			"minimumFetchInterval",
		),
		maximumConcurrentFetches: requirePositiveInteger(
			policy?.maximumConcurrentFetches ??
				DEFAULT_METADATA_FETCH_POLICY.maximumConcurrentFetches,
			"maximumConcurrentFetches",
		),
		maximumConcurrentFetchesPerOrigin: requirePositiveInteger(
			policy?.maximumConcurrentFetchesPerOrigin ??
				DEFAULT_METADATA_FETCH_POLICY.maximumConcurrentFetchesPerOrigin,
			"maximumConcurrentFetchesPerOrigin",
		),
		maximumFetchesPerMinute: requirePositiveInteger(
			policy?.maximumFetchesPerMinute ??
				DEFAULT_METADATA_FETCH_POLICY.maximumFetchesPerMinute,
			"maximumFetchesPerMinute",
		),
		maximumFetchesPerOriginPerMinute: requirePositiveInteger(
			policy?.maximumFetchesPerOriginPerMinute ??
				DEFAULT_METADATA_FETCH_POLICY.maximumFetchesPerOriginPerMinute,
			"maximumFetchesPerOriginPerMinute",
		),
	};
}

function pruneFetchStartTimesMs(
	fetchStartTimesMs: number[],
	nowMs: number,
): void {
	const windowStart = nowMs - FETCH_BUDGET_WINDOW_MS;
	let firstRetainedIndex = 0;
	while (
		firstRetainedIndex < fetchStartTimesMs.length &&
		(fetchStartTimesMs[firstRetainedIndex] as number) <= windowStart
	) {
		firstRetainedIndex += 1;
	}
	if (firstRetainedIndex > 0) {
		fetchStartTimesMs.splice(0, firstRetainedIndex);
	}
}

function resolveMetadataRevalidationIntervalMs(
	metadataRevalidationInterval: number | string,
	nowMs: number,
): number {
	if (typeof metadataRevalidationInterval === "number") {
		return Math.max(0, metadataRevalidationInterval * 1000);
	}
	const nowSeconds = Math.floor(nowMs / 1000);
	return Math.max(
		0,
		(toExpJWT(metadataRevalidationInterval, nowSeconds) - nowSeconds) * 1000,
	);
}

function parseCacheControl(value: string | undefined): {
	directives: Map<string, string | true>;
	duplicates: Set<string>;
} {
	const directives = new Map<string, string | true>();
	const duplicates = new Set<string>();
	for (const rawDirective of value?.split(",") ?? []) {
		const [rawName, ...rawValue] = rawDirective.trim().split("=");
		const name = rawName?.toLowerCase();
		if (!name) continue;
		if (directives.has(name)) duplicates.add(name);
		const joinedValue = rawValue.join("=").trim();
		directives.set(
			name,
			joinedValue ? joinedValue.replace(/^"|"$/g, "") : true,
		);
	}
	return { directives, duplicates };
}

function parseNonNegativeSeconds(
	value: string | true | undefined,
): number | null {
	if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
	const seconds = Number(value);
	return Number.isSafeInteger(seconds) ? seconds : null;
}

function computeExpiresAt(
	cacheHeaders: MetadataDocumentResponseCacheHeaders,
	metadataRevalidationInterval: number | string,
	nowMs: number,
): { cacheable: boolean; expiresAt: number } {
	const { directives, duplicates } = parseCacheControl(
		cacheHeaders.cacheControl,
	);
	const variesByEverything = cacheHeaders.vary
		?.split(",")
		.some((field) => field.trim() === "*");
	if (
		directives.has("no-store") ||
		directives.has("private") ||
		variesByEverything
	) {
		return { cacheable: false, expiresAt: nowMs };
	}

	const operatorLifetime = resolveMetadataRevalidationIntervalMs(
		metadataRevalidationInterval,
		nowMs,
	);
	if (directives.has("no-cache")) {
		return { cacheable: true, expiresAt: nowMs };
	}

	const ageSeconds = parseNonNegativeSeconds(cacheHeaders.age) ?? 0;
	const responseDate = cacheHeaders.date
		? Date.parse(cacheHeaders.date)
		: nowMs;
	const apparentAge = Number.isFinite(responseDate)
		? Math.max(0, nowMs - responseDate)
		: 0;
	const currentAge = Math.max(apparentAge, ageSeconds * 1000);

	let originLifetime: number | null = null;
	const hasSharedMaxAge = directives.has("s-maxage");
	const sharedMaxAge = parseNonNegativeSeconds(directives.get("s-maxage"));
	const hasMaxAge = directives.has("max-age");
	const privateMaxAge = parseNonNegativeSeconds(directives.get("max-age"));
	const applicableFreshnessIsInvalid = hasSharedMaxAge
		? sharedMaxAge === null || duplicates.has("s-maxage")
		: hasMaxAge && (privateMaxAge === null || duplicates.has("max-age"));
	const maxAge = hasSharedMaxAge ? sharedMaxAge : privateMaxAge;
	if (applicableFreshnessIsInvalid) {
		originLifetime = 0;
	} else if (maxAge !== null) {
		originLifetime = Math.max(0, maxAge * 1000 - currentAge);
	} else if (cacheHeaders.expires) {
		const expires = Date.parse(cacheHeaders.expires);
		if (Number.isFinite(expires)) {
			const dateBase = Number.isFinite(responseDate) ? responseDate : nowMs;
			originLifetime = Math.max(0, expires - dateBase - currentAge);
		}
	}

	return {
		cacheable: true,
		expiresAt:
			nowMs + Math.min(operatorLifetime, originLifetime ?? operatorLifetime),
	};
}

function mergeCacheHeaders(
	previous: MetadataDocumentResponseCacheHeaders,
	revalidated: MetadataDocumentResponseCacheHeaders,
): MetadataDocumentResponseCacheHeaders {
	return {
		cacheControl: revalidated.cacheControl ?? previous.cacheControl,
		vary: revalidated.vary ?? previous.vary,
		expires: revalidated.expires ?? previous.expires,
		date: revalidated.date ?? previous.date,
		age: revalidated.age ?? previous.age,
		etag: revalidated.etag ?? previous.etag,
		lastModified: revalidated.lastModified ?? previous.lastModified,
	};
}

function createCacheEntry(
	metadata: OAuthClientMetadata,
	cacheHeaders: MetadataDocumentResponseCacheHeaders,
	metadataRevalidationInterval: number | string,
	nowMs: number,
): CimdMetadataCacheEntry | null {
	const freshness = computeExpiresAt(
		cacheHeaders,
		metadataRevalidationInterval,
		nowMs,
	);
	if (!freshness.cacheable) return null;
	return {
		metadata,
		expiresAt: freshness.expiresAt,
		etag: cacheHeaders.etag,
		lastModified: cacheHeaders.lastModified,
		responseCacheHeaders: cacheHeaders,
	};
}

/**
 * Build the resolver for one plugin-owned CIMD metadata cache.
 *
 * The cache lives in this closure, so separate `cimd()` plugin instances never
 * share trust state or conditional validators.
 */
export function createCimdResolver(cimdOptions: CimdOptions): CimdResolver {
	const metadataRevalidationInterval =
		cimdOptions.metadataRevalidationInterval ?? "60m";
	const maxCacheEntries = cimdOptions.maxCacheEntries ?? 1_000;
	if (!Number.isInteger(maxCacheEntries) || maxCacheEntries < 1) {
		throw new BetterAuthError(
			"cimd maxCacheEntries must be a positive integer",
		);
	}
	const fetchPolicy = resolveMetadataFetchPolicy(cimdOptions);
	const metadataCache = new Map<string, CimdMetadataCacheEntry>();
	const inFlightResolutionByClientId = new Map<
		string,
		Promise<SchemaClient<Scope[]> | null>
	>();
	const lastFetchStartAtMsByClientId = new Map<string, number>();
	const fetchStateByOrigin = new Map<string, OriginFetchState>();
	const globalFetchStartTimesMs: number[] = [];
	let activeFetchCount = 0;

	const readCacheEntry = (clientId: string) => {
		const entry = metadataCache.get(clientId);
		if (!entry) return undefined;
		metadataCache.delete(clientId);
		metadataCache.set(clientId, entry);
		return entry;
	};

	const storeCacheEntry = (clientId: string, entry: CimdMetadataCacheEntry) => {
		metadataCache.delete(clientId);
		while (metadataCache.size >= maxCacheEntries) {
			const leastRecentlyUsedClientId = metadataCache.keys().next().value;
			if (typeof leastRecentlyUsedClientId !== "string") break;
			metadataCache.delete(leastRecentlyUsedClientId);
		}
		metadataCache.set(clientId, entry);
	};

	const ensureClientFetchStateCapacity = (clientId: string, nowMs: number) => {
		if (lastFetchStartAtMsByClientId.has(clientId)) return;
		while (lastFetchStartAtMsByClientId.size >= maxCacheEntries) {
			let evicted = false;
			for (const [
				candidateClientId,
				candidateLastFetchStartAtMs,
			] of lastFetchStartAtMsByClientId) {
				if (
					fetchPolicy.minimumFetchIntervalMs > 0 &&
					nowMs - candidateLastFetchStartAtMs <
						fetchPolicy.minimumFetchIntervalMs
				) {
					continue;
				}
				lastFetchStartAtMsByClientId.delete(candidateClientId);
				evicted = true;
				break;
			}
			if (evicted) continue;
			throw createMetadataFetchUnavailableError(
				"metadata fetch client state is at capacity",
			);
		}
	};

	const readOrCreateOriginFetchState = (
		origin: string,
		nowMs: number,
	): OriginFetchState => {
		const existingState = fetchStateByOrigin.get(origin);
		if (existingState) {
			pruneFetchStartTimesMs(existingState.fetchStartTimesMs, nowMs);
			fetchStateByOrigin.delete(origin);
			fetchStateByOrigin.set(origin, existingState);
			return existingState;
		}

		while (fetchStateByOrigin.size >= maxCacheEntries) {
			let evicted = false;
			for (const [candidateOrigin, candidateState] of fetchStateByOrigin) {
				pruneFetchStartTimesMs(candidateState.fetchStartTimesMs, nowMs);
				if (
					candidateState.activeFetchCount > 0 ||
					candidateState.fetchStartTimesMs.length > 0
				) {
					continue;
				}
				fetchStateByOrigin.delete(candidateOrigin);
				evicted = true;
				break;
			}
			if (evicted) continue;
			throw createMetadataFetchUnavailableError(
				"metadata fetch origin state is at capacity",
			);
		}

		const createdState = {
			activeFetchCount: 0,
			fetchStartTimesMs: [],
		};
		fetchStateByOrigin.set(origin, createdState);
		return createdState;
	};

	const acquireMetadataFetchPermit = (clientId: string): (() => void) => {
		const nowMs = Date.now();
		const lastFetchStartAtMs = lastFetchStartAtMsByClientId.get(clientId);
		if (
			fetchPolicy.minimumFetchIntervalMs > 0 &&
			lastFetchStartAtMs !== undefined &&
			nowMs - lastFetchStartAtMs < fetchPolicy.minimumFetchIntervalMs
		) {
			throw createMetadataFetchUnavailableError(
				"metadata document fetch is within the per-client minimum interval",
			);
		}
		ensureClientFetchStateCapacity(clientId, nowMs);

		const origin = new URL(clientId).origin;
		const originState = readOrCreateOriginFetchState(origin, nowMs);

		pruneFetchStartTimesMs(globalFetchStartTimesMs, nowMs);
		if (activeFetchCount >= fetchPolicy.maximumConcurrentFetches) {
			throw createMetadataFetchUnavailableError(
				"global metadata fetch concurrency limit exceeded",
			);
		}
		if (
			originState.activeFetchCount >=
			fetchPolicy.maximumConcurrentFetchesPerOrigin
		) {
			throw createMetadataFetchUnavailableError(
				"metadata fetch concurrency limit exceeded for client origin",
			);
		}
		if (globalFetchStartTimesMs.length >= fetchPolicy.maximumFetchesPerMinute) {
			throw createMetadataFetchUnavailableError(
				"global metadata fetch rate limit exceeded",
			);
		}
		if (
			originState.fetchStartTimesMs.length >=
			fetchPolicy.maximumFetchesPerOriginPerMinute
		) {
			throw createMetadataFetchUnavailableError(
				"metadata fetch rate limit exceeded for client origin",
			);
		}

		lastFetchStartAtMsByClientId.delete(clientId);
		lastFetchStartAtMsByClientId.set(clientId, nowMs);
		globalFetchStartTimesMs.push(nowMs);
		originState.fetchStartTimesMs.push(nowMs);
		activeFetchCount += 1;
		originState.activeFetchCount += 1;

		let released = false;
		return () => {
			if (released) return;
			released = true;
			activeFetchCount -= 1;
			originState.activeFetchCount -= 1;
		};
	};

	return async (ctx, clientId, existingClient) => {
		if (!isCimdClientIdUrlCandidate(clientId)) {
			return null;
		}

		const provider = ctx.context.getPlugin("oauth-provider");
		if (!provider) {
			throw new BetterAuthError(
				"cimd discovery invoked without the oauth-provider plugin installed",
			);
		}
		const oauthOptions = provider.options as OAuthOptions<Scope[]>;
		const cachedEntry = readCacheEntry(clientId);
		const nowMs = Date.now();

		if (cachedEntry && cachedEntry.expiresAt > nowMs) {
			if (existingClient) return existingClient;
			return persistMetadataDocumentClient(
				ctx,
				clientId,
				cachedEntry.metadata,
				cimdOptions,
				oauthOptions,
			);
		}

		const inFlightResolution = inFlightResolutionByClientId.get(clientId);
		if (inFlightResolution) return inFlightResolution;

		const releaseMetadataFetchPermit = acquireMetadataFetchPermit(clientId);
		const resolution = (async () => {
			const fetched = await fetchClientMetadataDocument(
				ctx,
				clientId,
				cimdOptions,
				cachedEntry
					? {
							etag: cachedEntry.etag,
							lastModified: cachedEntry.lastModified,
						}
					: undefined,
			);

			if (fetched.status === "not-modified" && !cachedEntry) {
				throw invalidClient(
					"Metadata document returned 304 without a validated cached document",
				);
			}

			const metadata =
				fetched.status === "modified"
					? fetched.metadata
					: (cachedEntry as CimdMetadataCacheEntry).metadata;
			const storedClient = await persistMetadataDocumentClient(
				ctx,
				clientId,
				metadata,
				cimdOptions,
				oauthOptions,
				existingClient ?? undefined,
			);

			const cacheHeaders =
				fetched.status === "modified"
					? fetched.cacheHeaders
					: mergeCacheHeaders(
							(cachedEntry as CimdMetadataCacheEntry).responseCacheHeaders,
							fetched.cacheHeaders,
						);
			const nextEntry = createCacheEntry(
				metadata,
				cacheHeaders,
				metadataRevalidationInterval,
				Date.now(),
			);
			if (nextEntry) {
				storeCacheEntry(clientId, nextEntry);
			} else {
				metadataCache.delete(clientId);
			}
			return storedClient;
		})();
		inFlightResolutionByClientId.set(clientId, resolution);
		try {
			return await resolution;
		} finally {
			if (inFlightResolutionByClientId.get(clientId) === resolution) {
				inFlightResolutionByClientId.delete(clientId);
			}
			releaseMetadataFetchPermit();
		}
	};
}
