import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { isAPIError } from "@better-auth/core/utils/is-api-error";
import type {
	OAuthClientMetadata,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import { getExtensionClientMetadataFields } from "@better-auth/oauth-provider/internal";
import { toExpJWT } from "better-auth/plugins";
import { APIError } from "better-call";
import type { MetadataDocumentResponseCacheHeaders } from "./client-store";
import {
	assertClientIdUrlFetchable,
	FETCH_TIMEOUT_MS,
	fetchClientMetadataDocument,
	isClientCurrentWithMetadata,
	isMetadataFetchCapacityRefusal,
	isMetadataTransportError,
	isTransientMetadataFetchFailure,
	persistMetadataDocumentClient,
} from "./client-store";
import type {
	CimdMetadataResolution,
	CimdMetadataResolver,
	CimdMetadataResolverOptions,
	CimdOptions,
} from "./types";
import { isCimdClientIdUrlCandidate } from "./validate-metadata-document";

const FETCH_BUDGET_WINDOW_MS = 60_000;
// A request that joins a fetch stops waiting for it after twice the fetch
// timeout, even if the transport never settles.
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
// How recent a transient failure must be for the stored client to stand in
// when a local fetch limit refuses the fetch instead.
const STALE_CLIENT_REFUSAL_WINDOW_MS = 5 * 60_000;
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
	savedBy?: WeakSet<object>;
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
	savedBy?: WeakSet<object>;
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
function resolveMetadataStaleIfErrorMs(
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
	options: CimdMetadataResolverOptions,
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

interface DiscoveryRequest {
	options: CimdOptions;
	existingClient: SchemaClient<Scope[]> | null;
}

function getProviderOptions(ctx: GenericEndpointContext) {
	const provider = ctx.context.getPlugin("oauth-provider");
	if (!provider) {
		throw new BetterAuthError(
			"cimd discovery invoked without the oauth-provider plugin installed",
		);
	}
	return provider.options as OAuthOptions<Scope[]>;
}

function createResolverState(
	cimdOptions: CimdMetadataResolverOptions,
	shared = false,
) {
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
	// Evicting a transient record only makes the next request fetch.
	const transientFailureByClientId = new Map<
		string,
		{ failedAtMs: number; reason: string }
	>();
	// Evicting a terminal record moves the watermark, so stored clients
	// validated before it are not served stale and eviction cannot resume
	// stale serving.
	const terminalFailures = new Map<
		string,
		{ failedAtMs: number; savedBy?: WeakSet<object> }
	>();
	let terminalFailureEvictedAtMs = Number.NEGATIVE_INFINITY;
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

	const recordFetchSuccess = (clientId: string) => {
		transientFailureByClientId.delete(clientId);
		terminalFailures.delete(clientId);
	};

	const recordFetchFailure = (clientId: string, failure: unknown) => {
		if (
			staleIfErrorMs === null ||
			isMetadataFetchCapacityRefusal(failure) ||
			isTransientMetadataFetchFailure(failure)
		) {
			return;
		}
		transientFailureByClientId.delete(clientId);
	};

	const recordTransientFailure = (clientId: string, failure: unknown) => {
		transientFailureByClientId.delete(clientId);
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

	// A shared resolver cannot see every database's stored row. A rejected
	// document blocks every store. A rejected save permits fallback only in
	// stores that successfully saved that same validation.
	const recordTerminalFailure = (
		clientId: string,
		savedBy?: WeakSet<object>,
	) => {
		if (staleIfErrorMs === null) return;
		const nowMs = Date.now();
		const previous = terminalFailures.get(clientId);
		if (previous && previous.savedBy !== savedBy) savedBy = undefined;
		terminalFailures.delete(clientId);
		if (terminalFailures.size >= maxCacheEntries) {
			for (const [candidateClientId, { failedAtMs }] of terminalFailures) {
				if (nowMs - failedAtMs <= staleIfErrorMs) break;
				terminalFailures.delete(candidateClientId);
			}
		}
		while (terminalFailures.size >= maxCacheEntries) {
			const oldestClientId = terminalFailures.keys().next().value;
			if (typeof oldestClientId !== "string") break;
			terminalFailures.delete(oldestClientId);
			terminalFailureEvictedAtMs = nowMs;
		}
		terminalFailures.set(clientId, { failedAtMs: nowMs, savedBy });
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
		extensionFields: ReadonlySet<string>,
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
				extensionFields,
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
			const savedBy =
				shared && staleIfErrorMs !== null ? new WeakSet<object>() : undefined;
			if (nextEntry && savedBy) nextEntry.savedBy = savedBy;
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
				recordFetchSuccess(clientId);
			}
			return { metadata, nextEntry, savedBy };
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
			recordFetchFailure(clientId, error);
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

	function resolve(
		ctx: GenericEndpointContext,
		clientId: string,
	): Promise<CimdMetadataResolution | null>;
	function resolve(
		ctx: GenericEndpointContext,
		clientId: string,
		request: DiscoveryRequest,
	): Promise<SchemaClient<Scope[]> | null>;
	async function resolve(
		ctx: GenericEndpointContext,
		clientId: string,
		request?: DiscoveryRequest,
	) {
		if (!isCimdClientIdUrlCandidate(clientId)) {
			return null;
		}

		const oauthOptions = getProviderOptions(ctx);
		const existingClient = request?.existingClient;

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
			if (current && current !== entry) {
				current.saved = false;
				current.savedBy?.delete(ctx.context.adapter);
			}
		};

		const resolveDocument = async (
			{ metadata, nextEntry, savedBy }: FetchedMetadata,
			fromCache: boolean,
		) => {
			if (!request) return { metadata: structuredClone(metadata), fromCache };
			if (
				fromCache &&
				existingClient &&
				(shared
					? isClientCurrentWithMetadata(existingClient, metadata, oauthOptions)
					: nextEntry?.saved)
			)
				return existingClient;
			try {
				const storedClient = await persistMetadataDocumentClient(
					ctx,
					clientId,
					shared ? structuredClone(metadata) : metadata,
					request.options,
					oauthOptions,
					existingClient ?? undefined,
				);
				markSaved(nextEntry);
				const accepted = terminalFailures.get(clientId)?.savedBy;
				if (accepted !== savedBy) accepted?.delete(ctx.context.adapter);
				savedBy?.add(ctx.context.adapter);
				return storedClient;
			} catch (error) {
				if (!shared) {
					if (nextEntry && metadataCache.get(clientId) === nextEntry)
						metadataCache.delete(clientId);
					recordFailedFetch(clientId);
				}
				// A storage failure says nothing about the document.
				if (
					isAPIError(error) &&
					error.status === "BAD_REQUEST" &&
					(shared || storedClientWithinStaleBound())
				) {
					savedBy?.delete(ctx.context.adapter);
					recordTerminalFailure(clientId, savedBy);
				}
				throw error;
			}
		};

		// Only the stored row stands in, never an instance's cached document.
		const storedClientWithinStaleBound = () => {
			const terminal = terminalFailures.get(clientId);
			if (
				!existingClient?.updatedAt ||
				staleIfErrorMs === null ||
				(terminal && !terminal.savedBy?.has(ctx.context.adapter))
			) {
				return null;
			}
			const validatedAtMs = new Date(existingClient.updatedAt).getTime();
			if (validatedAtMs <= terminalFailureEvictedAtMs) return null;
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

		// A document cached while the policy ran or a retired fetch was pending
		// can be newer than the stored client this request started with.
		let checkedUrl = false;
		while (true) {
			const cachedEntry = readCacheEntry(clientId);
			if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
				return resolveDocument(
					{
						metadata: cachedEntry.metadata,
						nextEntry: cachedEntry,
						savedBy: cachedEntry.savedBy,
					},
					!checkedUrl,
				);
			}

			if (!checkedUrl) {
				// Policy may depend on this request. Check it before joining another
				// fetch, spending a permit, or serving a stored client during an outage.
				try {
					await assertClientIdUrlFetchable(ctx, clientId, cimdOptions);
				} catch (error) {
					recordFetchFailure(clientId, error);
					if (shared || storedClientWithinStaleBound())
						recordTerminalFailure(clientId);
					throw error;
				}
				checkedUrl = true;
				continue;
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
					: await startFetch(
							ctx,
							clientId,
							cachedEntry,
							getExtensionClientMetadataFields(oauthOptions),
						);
			} catch (error) {
				const storedClient = storedClientWithinStaleBound();
				if (storedClient && isTransientMetadataFetchFailure(error)) {
					recordTransientFailure(clientId, error);
					return serveStoredClient(storedClient, describeFetchFailure(error));
				}
				if (
					(shared || storedClient) &&
					!isTransientMetadataFetchFailure(error) &&
					!isMetadataFetchRefusal(error) &&
					!isMetadataFetchCapacityRefusal(error) &&
					!isMetadataTransportError(error)
				) {
					recordTerminalFailure(clientId);
				}
				const lastFailure = transientFailureByClientId.get(clientId);
				if (
					storedClient &&
					lastFailure &&
					Date.now() - lastFailure.failedAtMs <=
						STALE_CLIENT_REFUSAL_WINDOW_MS &&
					(isMetadataFetchRefusal(error) ||
						isMetadataFetchCapacityRefusal(error))
				) {
					return serveStoredClient(storedClient, lastFailure.reason);
				}
				throw error;
			}
			// Only a fetch whose outcome is used saves its document. A retired
			// fetch's document can be older than its replacement's, and saving it
			// would put the stored client behind a fresh cache entry that later
			// requests trust, so this request resolves again instead.
			if (fetched) return resolveDocument(fetched, false);
		}
	}
	return {
		resolve,
		jwksStaleIfError:
			staleIfErrorMs === null ? undefined : staleIfErrorMs / 1000,
	};
}

const resolverState = Symbol.for("@better-auth/cimd/metadata-resolver-state");
type SharedResolver = CimdMetadataResolver & {
	[resolverState]?: ReturnType<typeof createResolverState>;
};

/**
 * Build a resolver that fetches, validates, and caches Client ID Metadata
 * Documents, and saves nothing.
 *
 * The cache, fetch budgets, and in-flight fetches live in this closure. Pass
 * the result to `cimd({ metadataResolver })` to share them between discoveries
 * that are created per request, as a runtime whose database handle belongs to
 * one request needs. Without it, each plugin instance owns its own resolver, so
 * separate `cimd()` instances never share trust state or conditional validators.
 *
 * Concurrent requests for one client share a single fetch. The document each
 * request receives is its own copy, and the caller saves it with that
 * request's context. A request waits at most 10 seconds for each fetch it
 * joins and then fetches for itself, so a request that the runtime ended
 * cannot stall the others.
 *
 * The resolver carries `fetchClientMetadataResource`, and a discovery that uses
 * it fetches discovery-owned resources such as `jwks_uri` with that transport.
 */
export function createCimdMetadataResolver(
	options: CimdMetadataResolverOptions,
): CimdMetadataResolver {
	const state = createResolverState(options, true);
	return Object.assign(
		(ctx: GenericEndpointContext, clientId: string) =>
			state.resolve(ctx, clientId),
		{
			fetchClientMetadataResource: options.fetchClientMetadataResource,
			[resolverState]: state,
		},
	);
}

const METADATA_RESOLVER_OPTION_NAMES = [
	"fetchClientMetadataResource",
	"isMetadataDocumentUrlAllowed",
	"maxCacheEntries",
	"metadataFetchPolicy",
	"metadataProfile",
	"metadataRevalidationInterval",
	"metadataStaleIfError",
	"originBoundFields",
] as const satisfies readonly (keyof CimdMetadataResolverOptions)[];

export function createCimdResolver(options: CimdOptions): {
	resolve: CimdResolver;
	jwksStaleIfError?: number;
} {
	const shared: SharedResolver | undefined = options.metadataResolver;
	if (shared) {
		const misplaced = METADATA_RESOLVER_OPTION_NAMES.filter(
			(name) => options[name] !== undefined,
		);
		if (misplaced.length)
			throw new BetterAuthError(
				`cimd ${misplaced.join(", ")} cannot be set together with metadataResolver. Pass them to createCimdMetadataResolver instead.`,
			);
		if (typeof shared.fetchClientMetadataResource !== "function")
			throw new BetterAuthError(
				"cimd metadataResolver has no fetchClientMetadataResource. Create it with createCimdMetadataResolver.",
			);
	}
	const state = options.metadataResolver
		? shared?.[resolverState]
		: createResolverState(options);
	if (state) {
		return {
			resolve: (ctx, clientId, existingClient) =>
				state.resolve(ctx, clientId, { options, existingClient }),
			jwksStaleIfError: state.jwksStaleIfError,
		};
	}
	const resolveMetadata = options.metadataResolver!;
	return {
		async resolve(ctx, clientId, existingClient) {
			const result = await resolveMetadata(ctx, clientId);
			if (!result) return null;
			const oauthOptions = getProviderOptions(ctx);
			if (
				result.fromCache &&
				existingClient &&
				isClientCurrentWithMetadata(
					existingClient,
					result.metadata,
					oauthOptions,
				)
			)
				return existingClient;
			return persistMetadataDocumentClient(
				ctx,
				clientId,
				result.metadata,
				options,
				oauthOptions,
				existingClient ?? undefined,
			);
		},
	};
}
