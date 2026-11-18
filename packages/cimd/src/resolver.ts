import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { isAPIError } from "@better-auth/core/utils/is-api-error";
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
	FETCH_TIMEOUT_MS,
	fetchClientMetadataDocument,
	isMetadataFetchCapacityRefusal,
	isTransientMetadataFetchFailure,
	persistMetadataDocumentClient,
} from "./client-store";
import type { CimdOptions } from "./types";
import { isCimdClientIdUrlCandidate } from "./validate-metadata-document";

const FETCH_BUDGET_WINDOW_MS = 60_000;
// A request that joins a fetch stops waiting for it after twice the fetch
// timeout. The request that started the fetch enforces that timeout on the
// network fetch only, so a URL policy callback that runs longer than the wait
// counts as a stuck fetch.
const JOINED_FETCH_WAIT_MS = FETCH_TIMEOUT_MS * 2;
// A fetch holds its concurrency permit on a lease of the same length. Only the
// fetch's own request or a request for the same client can otherwise return
// the permit, so a fetch whose request the runtime ended would hold it forever.
const FETCH_PERMIT_LEASE_MS = JOINED_FETCH_WAIT_MS;
const MAX_METADATA_STALE_IF_ERROR_MS = 24 * 60 * 60 * 1000;
// While a stored client stands in for a document that failed to refresh, the
// document is fetched at most this often, so an outage does not spend the
// origin's fetch budget.
const STALE_CLIENT_REFETCH_INTERVAL_MS = 60_000;
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
	/**
	 * Whether a request has saved this document. The entry is cached before any
	 * request saves it, and a request that ends mid-save leaves it unsaved, so a
	 * cache hit returns the stored client unchanged only once this is set.
	 */
	saved: boolean;
}

interface FetchedMetadata {
	metadata: OAuthClientMetadata;
	nextEntry: CimdMetadataCacheEntry | null;
}

interface InFlightMetadataFetch {
	fetched: Promise<FetchedMetadata>;
	startedAtMs: number;
	/** Retires the fetch and returns its permit. Calling it again does nothing. */
	abandon: () => void;
	/**
	 * Whether the fetch was retired and its outcome is not used. A retired
	 * fetch's document may be older than the document of the fetch that
	 * replaced it, so nobody saves it, and its failure is not reported. A fetch
	 * retired by the lease with no replacement is used when it answers late.
	 */
	isDiscarded: () => boolean;
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

const metadataFetchRefusals = new WeakSet<object>();

function createMetadataFetchUnavailableError(description: string): APIError {
	const error = new APIError("TOO_MANY_REQUESTS", {
		error: "temporarily_unavailable",
		error_description: description,
	});
	metadataFetchRefusals.add(error);
	return error;
}

function isMetadataFetchRefusal(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		metadataFetchRefusals.has(error)
	);
}

function describeFetchFailure(error: unknown): string {
	const description = isAPIError(error)
		? error.body?.error_description
		: undefined;
	if (typeof description === "string") return description;
	return error instanceof Error ? error.message : String(error);
}

/**
 * Validate `metadataStaleIfError` and return it in milliseconds, or `null`
 * when it is unset.
 */
export function resolveMetadataStaleIfErrorMs(
	value: number | string | undefined,
): number | null {
	if (value === undefined) return null;
	let durationMs: number;
	if (typeof value === "number") {
		durationMs = value * 1000;
	} else {
		try {
			const nowSeconds = Math.floor(Date.now() / 1000);
			durationMs = (toExpJWT(value, nowSeconds) - nowSeconds) * 1000;
		} catch {
			durationMs = Number.NaN;
		}
	}
	if (
		!Number.isFinite(durationMs) ||
		durationMs < 0 ||
		durationMs > MAX_METADATA_STALE_IF_ERROR_MS
	) {
		throw new BetterAuthError(
			"cimd metadataStaleIfError must be a non-negative number of seconds or duration string of at most 24 hours",
		);
	}
	return durationMs;
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
		saved: false,
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
	const staleIfErrorMs = resolveMetadataStaleIfErrorMs(
		cimdOptions.metadataStaleIfError,
	);
	const metadataCache = new Map<string, CimdMetadataCacheEntry>();
	// Clients whose last fetch failed transiently, kept only while
	// `metadataStaleIfError` is set. An evicted record makes the next request
	// fetch, which is safe.
	const transientFailureByClientId = new Map<
		string,
		{ failedAtMs: number; reason: string }
	>();
	const inFlightMetadataByClientId = new Map<string, InFlightMetadataFetch>();
	// The latest fetch the lease retired for a client, until it settles or a
	// newer fetch for that client starts. Only this fetch may be used late, and
	// an evicted marker makes the late document unusable, which is safe.
	const leaseRetiredFetchByClientId = new Map<string, InFlightMetadataFetch>();
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

	const recordFetchOutcome = (clientId: string, failure?: unknown) => {
		transientFailureByClientId.delete(clientId);
		if (staleIfErrorMs === null || !isTransientMetadataFetchFailure(failure)) {
			return;
		}
		while (transientFailureByClientId.size >= maxCacheEntries) {
			const oldestClientId = transientFailureByClientId.keys().next().value;
			if (typeof oldestClientId !== "string") break;
			transientFailureByClientId.delete(oldestClientId);
		}
		transientFailureByClientId.set(clientId, {
			failedAtMs: Date.now(),
			reason: describeFetchFailure(failure),
		});
	};

	const ensureClientFetchStateCapacity = (clientId: string, nowMs: number) => {
		if (lastFetchStartAtMsByClientId.has(clientId)) return;
		while (lastFetchStartAtMsByClientId.size >= maxCacheEntries) {
			let evicted = false;
			for (const [
				candidateClientId,
				candidateLastFetchStartAtMs,
			] of lastFetchStartAtMsByClientId) {
				if (inFlightMetadataByClientId.has(candidateClientId)) {
					continue;
				}
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

	// A fetch started by a request that the runtime then ends never settles, and
	// its permit is never released. Retiring it removes it from the in-flight
	// map and returns its pacing record and permit. It can no longer record a
	// failure, and the requests that wait on it re-enter resolution instead of
	// using its outcome, so later requests fetch again. Only a fetch the lease
	// retired can still publish its document, while nothing has replaced it.
	const retireFetch = (clientId: string, inFlight: InFlightMetadataFetch) => {
		if (inFlightMetadataByClientId.get(clientId) === inFlight) {
			inFlightMetadataByClientId.delete(clientId);
			lastFetchStartAtMsByClientId.delete(clientId);
			// A retired fetch that never settles never reaches its own cleanup.
			fetchStartMarkByClientId.delete(clientId);
		}
		inFlight.abandon();
	};

	const retireFetchesPastLease = (nowMs: number) => {
		for (const [clientId, inFlight] of inFlightMetadataByClientId) {
			if (nowMs - inFlight.startedAtMs < FETCH_PERMIT_LEASE_MS) continue;
			retireFetch(clientId, inFlight);
			leaseRetiredFetchByClientId.delete(clientId);
			while (leaseRetiredFetchByClientId.size >= maxCacheEntries) {
				const oldestClientId = leaseRetiredFetchByClientId.keys().next().value;
				if (typeof oldestClientId !== "string") break;
				leaseRetiredFetchByClientId.delete(oldestClientId);
			}
			leaseRetiredFetchByClientId.set(clientId, inFlight);
		}
	};

	const acquireMetadataFetchPermit = (
		clientId: string,
		nowMs: number,
	): (() => void) => {
		// Retiring first also frees the client and origin records that fetches
		// past their lease hold, before the capacity checks below count them.
		retireFetchesPastLease(nowMs);
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

	// The mark of each client's fetch in flight. A failed fetch or save writes a
	// new mark, so a capacity refusal that ends later can tell that the pacing
	// record is no longer its own.
	const fetchStartMarkByClientId = new Map<string, number>();
	let lastFetchStartMark = 0;

	const recordFailedFetch = (clientId: string) => {
		const nowMs = Date.now();
		if (fetchStartMarkByClientId.has(clientId)) {
			lastFetchStartMark += 1;
			fetchStartMarkByClientId.set(clientId, lastFetchStartMark);
		}
		lastFetchStartAtMsByClientId.delete(clientId);
		try {
			ensureClientFetchStateCapacity(clientId, nowMs);
		} catch {
			// The state map is full of clients still inside their backoff. Skip
			// the backoff for this client rather than outgrow the bound or replace
			// the error being reported.
			return;
		}
		lastFetchStartAtMsByClientId.set(clientId, nowMs);
	};

	// Resolves to `undefined` when the request stopped waiting or the fetch's
	// outcome, a document or a failure, is not used.
	const joinFetch = async (
		clientId: string,
		inFlight: InFlightMetadataFetch,
	): Promise<FetchedMetadata | undefined> => {
		let giveUp: (value: undefined) => void = () => {};
		const gaveUp = new Promise<undefined>((resolve) => {
			giveUp = resolve;
		});
		const timer = setTimeout(giveUp, JOINED_FETCH_WAIT_MS);
		let fetched: FetchedMetadata | undefined;
		try {
			fetched = await Promise.race([inFlight.fetched, gaveUp]);
		} catch (error) {
			if (inFlight.isDiscarded()) return undefined;
			throw error;
		} finally {
			clearTimeout(timer);
		}
		if (fetched === undefined) {
			retireFetch(clientId, inFlight);
			return undefined;
		}
		return inFlight.isDiscarded() ? undefined : fetched;
	};

	// Resolves to `undefined` when the fetch was retired before it settled and
	// its outcome, a document or a failure, is not used.
	const startFetch = async (
		ctx: GenericEndpointContext,
		clientId: string,
		cachedEntry: CimdMetadataCacheEntry | undefined,
	): Promise<FetchedMetadata | undefined> => {
		const startedAtMs = Date.now();
		const previousFetchStartAtMs = lastFetchStartAtMsByClientId.get(clientId);
		const releaseMetadataFetchPermit = acquireMetadataFetchPermit(
			clientId,
			startedAtMs,
		);
		lastFetchStartMark += 1;
		const startMark = lastFetchStartMark;
		fetchStartMarkByClientId.set(clientId, startMark);
		let abandoned = false;
		let acceptedLate = false;
		let startedFetch: InFlightMetadataFetch | undefined;
		const metadataFetch = (async (): Promise<FetchedMetadata> => {
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
			// A retired fetch leaves the cache and pacing to the fetch that replaced
			// it. When the lease retired it and no fetch for the client started
			// since, its document is the newest there is, so it is used instead of
			// spending another fetch on the same document. The marker records the
			// replacement directly, because a document that cannot be cached leaves
			// no cache entry to compare.
			if (
				abandoned &&
				leaseRetiredFetchByClientId.get(clientId) === startedFetch &&
				!inFlightMetadataByClientId.has(clientId) &&
				metadataCache.get(clientId) === cachedEntry
			) {
				acceptedLate = true;
			}
			if (!abandoned || acceptedLate) {
				if (nextEntry) {
					storeCacheEntry(clientId, nextEntry);
				} else {
					metadataCache.delete(clientId);
				}
				// Successful fetches are governed by HTTP freshness and origin/global
				// budgets. Keep the per-client interval only as failed-fetch backoff.
				lastFetchStartAtMsByClientId.delete(clientId);
				recordFetchOutcome(clientId);
			}
			return { metadata, nextEntry };
		})();
		const inFlight: InFlightMetadataFetch = {
			fetched: metadataFetch,
			startedAtMs,
			abandon() {
				abandoned = true;
				releaseMetadataFetchPermit();
			},
			isDiscarded: () => abandoned && !acceptedLate,
		};
		startedFetch = inFlight;
		leaseRetiredFetchByClientId.delete(clientId);
		inFlightMetadataByClientId.set(clientId, inFlight);
		try {
			const fetched = await metadataFetch;
			return inFlight.isDiscarded() ? undefined : fetched;
		} catch (error) {
			if (inFlight.isDiscarded()) return undefined;
			if (isMetadataFetchCapacityRefusal(error)) {
				// Nothing reached the host, so the refusal undoes only its own start
				// mark. A record written since, such as a failed save's backoff, stays.
				if (fetchStartMarkByClientId.get(clientId) === startMark) {
					if (previousFetchStartAtMs === undefined) {
						lastFetchStartAtMsByClientId.delete(clientId);
					} else {
						lastFetchStartAtMsByClientId.set(clientId, previousFetchStartAtMs);
					}
				}
			} else {
				recordFailedFetch(clientId);
			}
			recordFetchOutcome(clientId, error);
			throw error;
		} finally {
			if (inFlightMetadataByClientId.get(clientId) === inFlight) {
				inFlightMetadataByClientId.delete(clientId);
			}
			if (leaseRetiredFetchByClientId.get(clientId) === inFlight) {
				leaseRetiredFetchByClientId.delete(clientId);
			}
			if (!inFlightMetadataByClientId.has(clientId)) {
				fetchStartMarkByClientId.delete(clientId);
			}
			releaseMetadataFetchPermit();
		}
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

		// Each request saves the fetched document with its own context, and no
		// request waits for another request's save. A request that ends mid-save
		// could leave that save pending forever, and a runtime that bounds I/O to
		// the request that started it cannot await the save from another request.
		// Saves are not ordered across requests, so a save that lands after a
		// newer document was cached may have overwritten that document's save.
		// The newer entry is then saved again on its next cache hit.
		const markSaved = (entry: CimdMetadataCacheEntry | null) => {
			if (entry) entry.saved = true;
			const current = metadataCache.get(clientId);
			if (current && current !== entry) current.saved = false;
		};

		const persistFetchedMetadata = async ({
			metadata,
			nextEntry,
		}: FetchedMetadata) => {
			try {
				const storedClient = await persistMetadataDocumentClient(
					ctx,
					clientId,
					metadata,
					cimdOptions,
					oauthOptions,
					existingClient ?? undefined,
				);
				markSaved(nextEntry);
				return storedClient;
			} catch (error) {
				if (nextEntry && metadataCache.get(clientId) === nextEntry) {
					metadataCache.delete(clientId);
				}
				recordFailedFetch(clientId);
				throw error;
			}
		};

		// CIMD draft-03 §6.1: a transient failure should not invalidate a
		// client's established trust. Only the stored row stands in, never an
		// instance's cached document, so every instance answers alike.
		const storedClientWithinStaleBound = () => {
			if (!existingClient?.updatedAt || staleIfErrorMs === null) return null;
			const validatedAtMs = new Date(existingClient.updatedAt).getTime();
			return Date.now() - validatedAtMs <= staleIfErrorMs
				? existingClient
				: null;
		};
		const serveStoredClient = (
			storedClient: SchemaClient<Scope[]>,
			reason: string,
		) => {
			ctx.context.logger.warn(
				`cimd is serving the stored client ${clientId} because its metadata document could not be refreshed: ${reason}`,
			);
			return storedClient;
		};

		// A request resolves again only after a fetch it waited on was retired. A
		// fresh cache entry found then came from a later fetch, so the stored
		// client the request started with can be older than it.
		let resolvingAgain = false;
		while (true) {
			const cachedEntry = readCacheEntry(clientId);
			if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
				if (existingClient && cachedEntry.saved && !resolvingAgain) {
					return existingClient;
				}
				// The stored client can be missing or older than this entry. Later
				// cache hits return it once the entry is saved, so a failed save must
				// not leave this entry behind.
				return persistFetchedMetadata({
					metadata: cachedEntry.metadata,
					nextEntry: cachedEntry,
				});
			}

			const transientFailure = transientFailureByClientId.get(clientId);
			if (
				transientFailure &&
				Date.now() - transientFailure.failedAtMs <
					STALE_CLIENT_REFETCH_INTERVAL_MS
			) {
				const storedClient = storedClientWithinStaleBound();
				if (storedClient) {
					return serveStoredClient(storedClient, transientFailure.reason);
				}
			}

			const sharedFetch = inFlightMetadataByClientId.get(clientId);
			let fetched: FetchedMetadata | undefined;
			try {
				fetched = sharedFetch
					? await joinFetch(clientId, sharedFetch)
					: await startFetch(ctx, clientId, cachedEntry);
			} catch (error) {
				const storedClient = storedClientWithinStaleBound();
				if (storedClient && isTransientMetadataFetchFailure(error)) {
					return serveStoredClient(storedClient, describeFetchFailure(error));
				}
				// The fetch limits refused a client already being served stale.
				const lastFailure = transientFailureByClientId.get(clientId);
				if (storedClient && lastFailure && isMetadataFetchRefusal(error)) {
					return serveStoredClient(storedClient, lastFailure.reason);
				}
				throw error;
			}
			// Only a fetch whose outcome is used saves its document. A retired
			// fetch's document can be older than its replacement's, and saving it
			// would put the stored client behind a fresh cache entry that later
			// requests trust, so this request resolves again instead.
			if (fetched) return persistFetchedMetadata(fetched);
			resolvingAgain = true;
		}
	};
}
