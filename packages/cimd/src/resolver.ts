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
	fetchMetadataDocument,
	persistMetadataDocumentClient,
} from "./client-store";
import type { CimdOptions } from "./types";
import { isUrlClientId } from "./validate-metadata-document";

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

function invalidClient(description: string): APIError {
	return new APIError("BAD_REQUEST", {
		error: "invalid_client",
		error_description: description,
	});
}

function refreshRateMilliseconds(
	refreshRate: number | string,
	nowMilliseconds: number,
): number {
	if (typeof refreshRate === "number") {
		return Math.max(0, refreshRate * 1000);
	}
	const nowSeconds = Math.floor(nowMilliseconds / 1000);
	return Math.max(0, (toExpJWT(refreshRate, nowSeconds) - nowSeconds) * 1000);
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
	refreshRate: number | string,
	nowMilliseconds: number,
): { cacheable: boolean; expiresAt: number } {
	const { directives, duplicates } = parseCacheControl(
		cacheHeaders.cacheControl,
	);
	if (directives.has("no-store")) {
		return { cacheable: false, expiresAt: nowMilliseconds };
	}

	const operatorLifetime = refreshRateMilliseconds(
		refreshRate,
		nowMilliseconds,
	);
	if (directives.has("no-cache")) {
		return { cacheable: true, expiresAt: nowMilliseconds };
	}

	const ageSeconds = parseNonNegativeSeconds(cacheHeaders.age) ?? 0;
	const responseDate = cacheHeaders.date
		? Date.parse(cacheHeaders.date)
		: nowMilliseconds;
	const apparentAge = Number.isFinite(responseDate)
		? Math.max(0, nowMilliseconds - responseDate)
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
			const dateBase = Number.isFinite(responseDate)
				? responseDate
				: nowMilliseconds;
			originLifetime = Math.max(0, expires - dateBase - currentAge);
		}
	}

	return {
		cacheable: true,
		expiresAt:
			nowMilliseconds +
			Math.min(operatorLifetime, originLifetime ?? operatorLifetime),
	};
}

function mergeCacheHeaders(
	previous: MetadataDocumentResponseCacheHeaders,
	revalidated: MetadataDocumentResponseCacheHeaders,
): MetadataDocumentResponseCacheHeaders {
	return {
		cacheControl: revalidated.cacheControl ?? previous.cacheControl,
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
	refreshRate: number | string,
	nowMilliseconds: number,
): CimdMetadataCacheEntry | null {
	const freshness = computeExpiresAt(
		cacheHeaders,
		refreshRate,
		nowMilliseconds,
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
export function createCimdResolver(
	cimdOptions: CimdOptions = {},
): CimdResolver {
	const refreshRate = cimdOptions.refreshRate ?? "60m";
	const maxCacheEntries = cimdOptions.maxCacheEntries ?? 1_000;
	if (!Number.isInteger(maxCacheEntries) || maxCacheEntries < 1) {
		throw new BetterAuthError(
			"cimd maxCacheEntries must be a positive integer",
		);
	}
	const metadataCache = new Map<string, CimdMetadataCacheEntry>();

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

	return async (ctx, clientId, existingClient) => {
		if (
			!isUrlClientId(clientId, { allowLoopback: cimdOptions.allowLoopback })
		) {
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
		const nowMilliseconds = Date.now();

		if (cachedEntry && cachedEntry.expiresAt > nowMilliseconds) {
			if (existingClient) return existingClient;
			return persistMetadataDocumentClient(
				ctx,
				clientId,
				cachedEntry.metadata,
				cimdOptions,
				oauthOptions,
			);
		}

		const fetched = await fetchMetadataDocument(
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
			refreshRate,
			Date.now(),
		);
		if (nextEntry) {
			storeCacheEntry(clientId, nextEntry);
		} else {
			metadataCache.delete(clientId);
		}
		return storedClient;
	};
}
