import type { GenericEndpointContext } from "@better-auth/core";
import { encodeDeterministicId } from "@better-auth/core/db/internal";
import {
	CLIENT_ASSERTION_TYPE,
	PRIVATE_KEY_JWT_SIGNING_ALGORITHMS,
} from "@better-auth/core/oauth2";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import { createHash } from "@better-auth/utils/hash";
import { APIError } from "better-call";
import type { JSONWebKeySet } from "jose";
import {
	createLocalJWKSet,
	decodeJwt,
	decodeProtectedHeader,
	jwtVerify,
} from "jose";
import { getIssuer } from "../authorize";
import { validatePublicClientJwks } from "../client-jwks";
import { getClientDiscoveries } from "../extensions";
import type {
	ClientMetadataResourceFetch,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "../types";
import { challengeHeaders, getAuthEndpointUrl, getClient } from "./index";

type FetchedJwksResult =
	| { valid: true; jwks: JSONWebKeySet }
	| { valid: false };
type JwksCacheEntry = { jwks: JSONWebKeySet; fetchedAt: number };
type JwksFetch = { promise: Promise<FetchedJwksResult>; startedAt: number };
type JwksCache = {
	/** Last valid key set per `jwks_uri`; only this map is bounded. */
	sets: Map<string, JwksCacheEntry>;
	/** Fetch in flight per `jwks_uri`, kept apart so failures never evict a set. */
	fetches: Map<string, JwksFetch>;
};

// Provider-scoped JWKS URI caches with 5-minute TTL and bounded size.
const jwksCaches = new WeakMap<OAuthOptions<Scope[]>, JwksCache>();
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_CACHE_MAX_ENTRIES = 500;
const JWKS_FETCH_TIMEOUT_MS = 5_000;
const MAX_JWKS_RESPONSE_BYTES = 64 * 1024;
const JSON_CONTENT_TYPE = /^application\/(?:[-\w.]+\+)?json\s*(?:;|$)/i;

function getJwksCache(opts: OAuthOptions<Scope[]>): JwksCache {
	let cache = jwksCaches.get(opts);
	if (!cache) {
		cache = { sets: new Map(), fetches: new Map() };
		jwksCaches.set(opts, cache);
	}
	return cache;
}

function setJwksCache(
	cache: JwksCache,
	cacheKey: string,
	jwks: JSONWebKeySet,
	fetchedAt: number,
) {
	const current = cache.sets.get(cacheKey);
	if (current && current.fetchedAt > fetchedAt) return;
	cache.sets.set(cacheKey, { jwks, fetchedAt });
	if (cache.sets.size > JWKS_CACHE_MAX_ENTRIES) {
		// Evict oldest entry (Map iterates in insertion order)
		const oldest = cache.sets.keys().next().value;
		if (oldest !== undefined) cache.sets.delete(oldest);
	}
}

// A fetch older than its own timeout is dead: some runtimes cancel a
// request's I/O when that request ends, so its promise may never settle.
function isFetching(fetch: JwksFetch | undefined, now: number): boolean {
	return fetch !== undefined && now - fetch.startedAt < JWKS_FETCH_TIMEOUT_MS;
}

/**
 * Loads a key set, sharing one request per `jwks_uri` between callers. A
 * caller joins a fetch in flight only when `canJoin` accepts it, so a request
 * can require a fetch that started after it did. Each caller bounds its own
 * wait, since the request that started a fetch may end before it settles.
 * A caller whose joined fetch throws makes one fetch of its own, as it would
 * without sharing, so a failure that is not its own does not fail it.
 */
async function loadJwks(
	cache: JwksCache,
	cacheKey: string,
	jwksUri: string,
	fetchClientMetadataResource: ClientMetadataResourceFetch | undefined,
	canJoin: (fetch: JwksFetch) => boolean = () => true,
): Promise<FetchedJwksResult> {
	const start = (joinable: (fetch: JwksFetch) => boolean) => {
		const current = cache.fetches.get(cacheKey);
		if (current && isFetching(current, Date.now()) && joinable(current)) {
			return { fetch: current, joined: true };
		}
		const startedAt = Date.now();
		const fetch: JwksFetch = {
			startedAt,
			promise: fetchJwksFromUri(jwksUri, fetchClientMetadataResource)
				.then((result) => {
					if (result.valid) {
						setJwksCache(cache, cacheKey, result.jwks, startedAt);
					}
					return result;
				})
				.finally(() => {
					if (cache.fetches.get(cacheKey) === fetch) {
						cache.fetches.delete(cacheKey);
					}
				}),
		};
		cache.fetches.set(cacheKey, fetch);
		return { fetch, joined: false };
	};
	const settle = async (fetch: JwksFetch): Promise<FetchedJwksResult> => {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				fetch.promise,
				new Promise<never>((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error("JWKS fetch timed out")),
						Math.max(0, fetch.startedAt + JWKS_FETCH_TIMEOUT_MS - Date.now()),
					);
				}),
			]);
		} finally {
			clearTimeout(timeout);
			if (
				cache.fetches.get(cacheKey) === fetch &&
				!isFetching(fetch, Date.now())
			) {
				cache.fetches.delete(cacheKey);
			}
		}
	};

	const first = start(canJoin);
	try {
		return await settle(first.fetch);
	} catch (error) {
		if (!first.joined) throw error;
	}
	return settle(
		start((fetch) => fetch !== first.fetch && canJoin(fetch)).fetch,
	);
}

function getJwksCacheKey(client: SchemaClient<Scope[]>): string {
	return `${client.clientDiscoveryId ?? "managed"}:${client.jwksUri ?? ""}`;
}
const ALGORITHMS_LIST: string[] = [...PRIVATE_KEY_JWT_SIGNING_ALGORITHMS];

// RFC 7519 §4.1.4 allows leeway "usually no more than a few minutes". Raising
// this cap later is compatible; lowering it would not be.
const MAX_ASSERTION_CLOCK_TOLERANCE_SECONDS = 60;

function getAssertionClockTolerance(opts: OAuthOptions<Scope[]>): number {
	const value = opts.assertionClockTolerance;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return 0;
	}
	return Math.min(value, MAX_ASSERTION_CLOCK_TOLERANCE_SECONDS);
}

/**
 * SSRF gate for user-supplied server-side fetch targets (`jwks_uri`,
 * `backchannel_logout_uri`): returns true when the host is NOT publicly
 * routable. That covers loopback, RFC 1918 private, link-local (including AWS
 * IMDS `169.254.169.254`), shared-address-space (carrier-grade NAT),
 * IPv4-mapped IPv6, 6to4/NAT64/Teredo tunnels, every other RFC 6890
 * special-purpose range, and cloud-metadata FQDNs.
 *
 * Delegates to the audited single source of truth so this check cannot drift
 * into the kind of encoding bypass that bespoke regexes invite. This is a
 * syntactic check only: it does not resolve DNS, so a public name that
 * resolves to a private address at fetch time is not caught here.
 */
export function isPrivateHostname(hostname: string): boolean {
	return !isPublicRoutableHost(hostname);
}

function validateJwksUri(
	ctx: GenericEndpointContext,
	jwksUri: string,
	clientIdUrlOrigin?: string,
): void {
	const parsed = new URL(jwksUri);
	if (parsed.protocol !== "https:") {
		throw new APIError("BAD_REQUEST", {
			error_description: "jwks_uri must use HTTPS",
			error: "invalid_client",
		});
	}
	if (parsed.username || parsed.password) {
		throw new APIError("BAD_REQUEST", {
			error_description: "jwks_uri must not contain credentials",
			error: "invalid_client",
		});
	}
	// URL.hash is empty for a bare trailing `#`, so inspect the source value.
	if (jwksUri.includes("#")) {
		throw new APIError("BAD_REQUEST", {
			error_description: "jwks_uri must not include a fragment component",
			error: "invalid_client",
		});
	}
	if (isPrivateHostname(parsed.hostname)) {
		throw new APIError("BAD_REQUEST", {
			error_description:
				"jwks_uri must not point to a private or reserved address",
			error: "invalid_client",
		});
	}
	// Trust a jwks_uri that shares origin with a URL-format client_id: the
	// discovery that installed the client has already verified the
	// client_id URL, and same-origin jwks_uri is part of that verification.
	if (clientIdUrlOrigin && parsed.origin === clientIdUrlOrigin) {
		return;
	}
	if (!ctx.context.isTrustedOrigin(parsed.href)) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client jwks_uri is not trusted",
			error: "invalid_client",
		});
	}
}

function urlClientIdOrigin(clientId: string): string | undefined {
	try {
		const parsed = new URL(clientId);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			return undefined;
		}
		return parsed.origin;
	} catch {
		return undefined;
	}
}

async function readBoundedResponseBody(response: Response): Promise<string> {
	const contentLength = response.headers.get("content-length");
	if (
		contentLength !== null &&
		Number.isFinite(Number(contentLength)) &&
		Number(contentLength) > MAX_JWKS_RESPONSE_BYTES
	) {
		await response.body?.cancel();
		throw new Error("JWKS response exceeds 64 KiB");
	}

	if (!response.body) {
		return "";
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		totalBytes += value.byteLength;
		if (totalBytes > MAX_JWKS_RESPONSE_BYTES) {
			await reader.cancel();
			throw new Error("JWKS response exceeds 64 KiB");
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

async function fetchJwksFromUri(
	jwksUri: string,
	fetchClientMetadataResource: ClientMetadataResourceFetch = globalThis.fetch,
): Promise<FetchedJwksResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS);
	try {
		const response = await fetchClientMetadataResource(jwksUri, {
			signal: controller.signal,
			headers: { accept: "application/json" },
			// Not "error": Workers rejects it. The status check refuses 3xx and opaque redirects.
			redirect: "manual",
		});
		if (response.redirected) {
			throw new Error("JWKS fetch redirected");
		}
		if (response.status !== 200) {
			throw new Error(`JWKS fetch returned ${response.status}`);
		}
		const contentType = response.headers.get("content-type");
		if (!contentType || !JSON_CONTENT_TYPE.test(contentType)) {
			throw new Error("JWKS response must use a JSON media type");
		}
		const responseBody = await readBoundedResponseBody(response);
		let parsedBody: unknown;
		try {
			parsedBody = JSON.parse(responseBody);
		} catch {
			return { valid: false };
		}
		const result = validatePublicClientJwks(parsedBody);
		if (!result.valid) {
			return { valid: false };
		}
		return { valid: true, jwks: result.jwks };
	} finally {
		clearTimeout(timeout);
	}
}

function createClientJwksFetchError(): APIError {
	return new APIError("BAD_REQUEST", {
		error_description: "failed to fetch client JWKS",
		error: "invalid_client",
	});
}

async function fetchClientJwks(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	client: SchemaClient<Scope[]>,
): Promise<JSONWebKeySet> {
	if (client.jwks) {
		return JSON.parse(client.jwks) as JSONWebKeySet;
	}

	if (!client.jwksUri) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client has no JWKS configured",
			error: "invalid_client",
		});
	}

	const discovery = client.clientDiscoveryId
		? getClientDiscoveries(opts).find(
				(candidate) => candidate.id === client.clientDiscoveryId,
			)
		: undefined;
	if (client.clientDiscoveryId && !discovery?.fetchClientMetadataResource) {
		throw new APIError("BAD_REQUEST", {
			error_description:
				"client discovery does not provide a metadata resource transport",
			error: "invalid_client",
		});
	}
	validateJwksUri(
		ctx,
		client.jwksUri,
		client.clientDiscoveryId ? urlClientIdOrigin(client.clientId) : undefined,
	);

	const now = Date.now();
	const cacheKey = getJwksCacheKey(client);
	const cache = getJwksCache(opts);
	const cached = cache.sets.get(cacheKey);
	if (cached && now - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
		return cached.jwks;
	}

	let result: FetchedJwksResult;
	try {
		result = await loadJwks(
			cache,
			cacheKey,
			client.jwksUri,
			discovery?.fetchClientMetadataResource,
		);
	} catch {
		// Return stale cache on transient failures, but only within a grace period.
		// After 2x the TTL, stale keys are no longer trusted (prevents accepting
		// revoked keys indefinitely when the JWKS endpoint is down).
		const staleLimitMs = JWKS_CACHE_TTL_MS * 2;
		if (cached && now - cached.fetchedAt < staleLimitMs) {
			return cached.jwks;
		}
		throw createClientJwksFetchError();
	}
	if (!result.valid) throw createClientJwksFetchError();
	return result.jwks;
}

/**
 * Refetch JWKS from jwks_uri when signature verification fails with cached keys.
 * Handles key rotation: the client may have published a new key that isn't in our cache yet.
 *
 * Only a fetch that started at or after `requestedAt` is shared. An earlier one
 * may predate the key the assertion names, so it cannot answer for it.
 */
async function refetchClientJwks(
	opts: OAuthOptions<Scope[]>,
	client: SchemaClient<Scope[]>,
	requestedAt: number,
): Promise<JSONWebKeySet | null> {
	if (!client.jwksUri) return null;
	const discovery = client.clientDiscoveryId
		? getClientDiscoveries(opts).find(
				(candidate) => candidate.id === client.clientDiscoveryId,
			)
		: undefined;
	if (client.clientDiscoveryId && !discovery?.fetchClientMetadataResource) {
		return null;
	}
	const cacheKey = getJwksCacheKey(client);
	try {
		const result = await loadJwks(
			getJwksCache(opts),
			cacheKey,
			client.jwksUri,
			discovery?.fetchClientMetadataResource,
			(fetch) => fetch.startedAt >= requestedAt,
		);
		return result.valid ? result.jwks : null;
	} catch {
		return null;
	}
}

/**
 * Enforces the assertion-hygiene claims every client-assertion authentication
 * method must check, independent of how the signature is verified or where the
 * verification keys come from:
 * - `aud` MUST include `expectedAudience` (RFC 7523 §3 rule 3),
 * - `exp` MUST be present, unexpired (within `assertionClockTolerance`), and
 *   at most `assertionMaxLifetime` plus `assertionClockTolerance` seconds away
 *   (RFC 7523 §3 rule 4),
 * - `iat`, when present, MUST be within `assertionMaxLifetime` (plus
 *   `assertionClockTolerance`),
 * - `jti` MUST be present and single-use; this consumes a replay tombstone keyed
 *   by `` `${namespace}:${jti}` ``, inserted under the adapter's primary key so a
 *   replay across workers fails atomically.
 *
 * A custom {@link OAuthClientAuthenticationStrategy} should call this after
 * verifying the assertion signature, so an extension method inherits the same
 * replay, lifetime, and audience guarantees as the built-in `private_key_jwt`
 * path, which calls it too.
 *
 * @param params.namespace Scopes the replay tombstone to the method and client,
 *   e.g. `` `${method}:${clientId}` ``, so the same `jti` can recur across
 *   distinct methods or clients but never within one.
 */
export async function consumeClientAssertion(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	params: {
		namespace: string;
		payload: { aud?: unknown; exp?: unknown; iat?: unknown; jti?: unknown };
		expectedAudience: string;
	},
): Promise<void> {
	const { namespace, payload, expectedAudience } = params;

	const audiences = Array.isArray(payload.aud)
		? payload.aud
		: payload.aud != null
			? [payload.aud]
			: [];
	if (!audiences.includes(expectedAudience)) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client assertion aud does not match the endpoint",
			error: "invalid_client",
		});
	}

	const maxLifetime = opts.assertionMaxLifetime ?? 300;
	const clockTolerance = getAssertionClockTolerance(opts);
	const now = Math.floor(Date.now() / 1000);
	if (typeof payload.exp !== "number") {
		throw new APIError("BAD_REQUEST", {
			error_description: "client assertion must include exp claim",
			error: "invalid_client",
		});
	}
	// An extension strategy relies on this; the built-in path has jose reject
	// expiry before this runs.
	if (payload.exp <= now - clockTolerance) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client assertion has expired",
			error: "invalid_client",
		});
	}
	// Cap the window so exp cannot outlive the jti tombstone.
	if (payload.exp - now > maxLifetime + clockTolerance) {
		throw new APIError("BAD_REQUEST", {
			error_description: `client assertion exp is too far in the future (max ${maxLifetime}s)`,
			error: "invalid_client",
		});
	}
	if (
		typeof payload.iat === "number" &&
		now - payload.iat > maxLifetime + clockTolerance
	) {
		throw new APIError("BAD_REQUEST", {
			error_description: `client assertion iat is too far in the past (max ${maxLifetime}s)`,
			error: "invalid_client",
		});
	}

	if (typeof payload.jti !== "string" || payload.jti.length === 0) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client assertion must include jti claim",
			error: "invalid_client",
		});
	}

	// Consume the jti with a single insert keyed by a digest of the namespaced
	// identifier, encoded so the configured id strategy keeps it. The primary key is the atomic gate on every adapter (SQL
	// primary key, MongoDB `_id`), so concurrent requests across workers cannot
	// both pass. A duplicate-key failure means the jti was already used (replay);
	// any other failure is surfaced unchanged.
	const jtiDigest = await createHash("SHA-256").digest(
		new TextEncoder().encode(`${namespace}:${payload.jti}`),
	);
	const jtiId = encodeDeterministicId(
		new Uint8Array(jtiDigest).slice(0, 24),
		ctx.context.options,
		{ adapter: ctx.context.adapter, model: "oauthClientAssertion" },
	);
	try {
		await ctx.context.adapter.create({
			model: "oauthClientAssertion",
			data: {
				id: jtiId,
				expiresAt: new Date((payload.exp + clockTolerance) * 1000),
			},
			forceAllowId: true,
		});
	} catch (createErr) {
		let alreadyUsed = false;
		try {
			alreadyUsed = Boolean(
				await ctx.context.adapter.findOne({
					model: "oauthClientAssertion",
					where: [{ field: "id", value: jtiId }],
				}),
			);
		} catch {
			// Lookup failed, so a replay cannot be confirmed; surface the insert error.
		}
		if (alreadyUsed) {
			throw new APIError("BAD_REQUEST", {
				error_description: "client assertion jti has already been used",
				error: "invalid_client",
			});
		}
		throw createErr;
	}
}

/**
 * Verifies a client assertion JWT for `private_key_jwt` authentication.
 *
 * Validates: signature, iss=client_id, sub=client_id, aud=the endpoint serving
 * the assertion or the normalized OP issuer, exp, assertion max lifetime,
 * jti uniqueness (replay prevention).
 *
 * Returns the client record the signature was checked against, so a caller that
 * mutates the client can guard its write on exactly that snapshot.
 *
 * With `endpointAudienceOnly`, the issuer is not an accepted audience, so only
 * an assertion whose `aud` includes `expectedAudience` verifies. Endpoints that
 * change client credentials use it, so an assertion minted for the token
 * endpoint or the issuer cannot be redirected to them.
 *
 * `assertClient` runs on the looked-up client before any key is fetched or the
 * jti is consumed, so a caller can refuse a client it does not serve without
 * spending the assertion or reaching out to a `jwks_uri`.
 */
export async function verifyClientAssertion(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	clientAssertion: string,
	clientAssertionType: string,
	clientIdHint?: string,
	expectedAudience?: string,
	options?: {
		endpointAudienceOnly?: boolean;
		assertClient?: (client: SchemaClient<Scope[]>) => void;
	},
): Promise<{ clientId: string; client: SchemaClient<Scope[]> }> {
	const requestedAt = Date.now();
	if (clientAssertionType !== CLIENT_ASSERTION_TYPE) {
		throw new APIError("BAD_REQUEST", {
			error_description: "unsupported client_assertion_type",
			error: "invalid_client",
		});
	}

	// Check algorithm from header before full verification
	let header: Awaited<ReturnType<typeof decodeProtectedHeader>>;
	try {
		header = decodeProtectedHeader(clientAssertion);
	} catch {
		throw new APIError("BAD_REQUEST", {
			error_description: "malformed client assertion: invalid JWT header",
			error: "invalid_client",
		});
	}
	if (!header.alg || !ALGORITHMS_LIST.includes(header.alg)) {
		throw new APIError("BAD_REQUEST", {
			error_description: `unsupported assertion signing algorithm: ${header.alg}`,
			error: "invalid_client",
		});
	}

	// Extract client_id from unverified payload (needed to look up JWKS)
	let unverified: ReturnType<typeof decodeJwt>;
	try {
		unverified = decodeJwt(clientAssertion);
	} catch {
		throw new APIError("BAD_REQUEST", {
			error_description: "malformed client assertion: invalid JWT payload",
			error: "invalid_client",
		});
	}
	const clientId = (unverified.sub as string) ?? (unverified.iss as string);
	if (!clientId) {
		throw new APIError("BAD_REQUEST", {
			error_description:
				"client assertion must contain sub or iss claim identifying the client",
			error: "invalid_client",
		});
	}

	// Validate consistency with body client_id if provided
	if (clientIdHint && clientIdHint !== clientId) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client_id in body does not match assertion sub/iss",
			error: "invalid_client",
		});
	}

	// Look up client and enforce auth method
	const client = await getClient(ctx, opts, clientId);
	if (!client) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client not found",
			error: "invalid_client",
		});
	}
	if (client.disabled) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client is disabled",
			error: "invalid_client",
		});
	}
	if (client.tokenEndpointAuthMethod !== "private_key_jwt") {
		throw new APIError("BAD_REQUEST", {
			error_description:
				"client is not registered for private_key_jwt authentication",
			error: "invalid_client",
		});
	}
	options?.assertClient?.(client);

	// Fetch JWKS and verify signature + claims
	const jwks = await fetchClientJwks(ctx, opts, client);
	const endpointAudience =
		expectedAudience ?? getAuthEndpointUrl(ctx, "/oauth2/token");
	const issuerAudience = getIssuer(ctx, opts);
	const acceptedAudiences = options?.endpointAudienceOnly
		? [endpointAudience]
		: [...new Set([endpointAudience, issuerAudience])];
	const verifyOpts = {
		issuer: clientId,
		subject: clientId,
		audience: acceptedAudiences,
		algorithms: ALGORITHMS_LIST,
		clockTolerance: getAssertionClockTolerance(opts),
	};

	// NOTE: We do NOT use jose's maxTokenAge option because it bounds (now - iat),
	// not (exp - now). Instead we explicitly check the assertion's remaining validity
	// window below; this correctly caps how far into the future exp can be set,
	// and ensures the JTI tombstone always outlives the assertion.
	let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
	try {
		({ payload } = await jwtVerify(
			clientAssertion,
			createLocalJWKSet(jwks),
			verifyOpts,
		));
	} catch (verifyErr) {
		// Only refetch JWKS on key-related errors (e.g., no matching key after
		// rotation). Claim validation failures (expired, bad audience) should
		// not trigger a refetch.
		const isKeyError =
			verifyErr instanceof Error &&
			/no matching key|no applicable key/i.test(verifyErr.message);
		if (isKeyError) {
			const refreshed = await refetchClientJwks(opts, client, requestedAt);
			if (refreshed) {
				try {
					({ payload } = await jwtVerify(
						clientAssertion,
						createLocalJWKSet(refreshed),
						verifyOpts,
					));
				} catch {
					throw new APIError(
						"UNAUTHORIZED",
						{
							error_description:
								"client assertion signature verification failed",
							error: "invalid_client",
						},
						challengeHeaders("Basic"),
					);
				}
			} else {
				throw new APIError(
					"UNAUTHORIZED",
					{
						error_description: "client assertion signature verification failed",
						error: "invalid_client",
					},
					challengeHeaders("Basic"),
				);
			}
		} else {
			throw new APIError(
				"UNAUTHORIZED",
				{
					error_description: "client assertion signature verification failed",
					error: "invalid_client",
				},
				challengeHeaders("Basic"),
			);
		}
	}

	const assertionAudiences = Array.isArray(payload.aud)
		? payload.aud
		: [payload.aud];
	// jwtVerify already matched the payload against this same audience set.
	const acceptedAudience = assertionAudiences.find(
		(value): value is string =>
			typeof value === "string" && acceptedAudiences.includes(value),
	)!;

	// Audience, lifetime, and jti single-use replay protection, shared with
	// extension client-auth methods through `consumeClientAssertion` so both
	// paths enforce RFC 7523 §3 identically. jose already matched `aud` via
	// `verifyOpts.audience`; the helper re-checks it so it is self-sufficient for
	// callers that verify the signature without jose.
	await consumeClientAssertion(ctx, opts, {
		namespace: `private_key_jwt:${clientId}`,
		payload,
		expectedAudience: acceptedAudience,
	});

	return { clientId, client };
}
