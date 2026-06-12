import type { GenericEndpointContext } from "@better-auth/core";
import {
	CLIENT_ASSERTION_TYPE,
	PRIVATE_KEY_JWT_SIGNING_ALGORITHMS,
} from "@better-auth/core/oauth2";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { APIError } from "better-call";
import type { JSONWebKeySet } from "jose";
import {
	createLocalJWKSet,
	decodeJwt,
	decodeProtectedHeader,
	jwtVerify,
} from "jose";
import type { OAuthOptions, SchemaClient, Scope } from "../types";
import { getClient } from "./index";

// JWKS URI cache with 5-minute TTL and bounded size
const jwksCache = new Map<string, { jwks: JSONWebKeySet; fetchedAt: number }>();
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_CACHE_MAX_ENTRIES = 500;
const JWKS_FETCH_TIMEOUT_MS = 5_000;

function setJwksCache(uri: string, jwks: JSONWebKeySet, fetchedAt: number) {
	jwksCache.set(uri, { jwks, fetchedAt });
	if (jwksCache.size > JWKS_CACHE_MAX_ENTRIES) {
		// Evict oldest entry (Map iterates in insertion order)
		const oldest = jwksCache.keys().next().value;
		if (oldest !== undefined) jwksCache.delete(oldest);
	}
}
const ALGORITHMS_LIST: string[] = [...PRIVATE_KEY_JWT_SIGNING_ALGORITHMS];

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
	if (!clientId.startsWith("https://") && !clientId.startsWith("http://")) {
		return undefined;
	}
	try {
		return new URL(clientId).origin;
	} catch {
		return undefined;
	}
}

async function fetchJwksFromUri(jwksUri: string): Promise<JSONWebKeySet> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(jwksUri, {
			signal: controller.signal,
			headers: { accept: "application/json" },
			redirect: "error",
		});
		if (!response.ok) {
			throw new Error(`JWKS fetch returned ${response.status}`);
		}
		const jwks = (await response.json()) as JSONWebKeySet;
		if (!jwks.keys || !Array.isArray(jwks.keys)) {
			throw new Error("JWKS response missing keys array");
		}
		return jwks;
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchClientJwks(
	ctx: GenericEndpointContext,
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

	validateJwksUri(ctx, client.jwksUri, urlClientIdOrigin(client.clientId));

	const now = Date.now();
	const cached = jwksCache.get(client.jwksUri);
	if (cached && now - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
		return cached.jwks;
	}

	try {
		const jwks = await fetchJwksFromUri(client.jwksUri);
		setJwksCache(client.jwksUri, jwks, now);
		return jwks;
	} catch {
		// Return stale cache on transient failures, but only within a grace period.
		// After 2x the TTL, stale keys are no longer trusted (prevents accepting
		// revoked keys indefinitely when the JWKS endpoint is down).
		const staleLimitMs = JWKS_CACHE_TTL_MS * 2;
		if (cached && now - cached.fetchedAt < staleLimitMs) {
			return cached.jwks;
		}
		throw new APIError("BAD_REQUEST", {
			error_description: "failed to fetch client JWKS",
			error: "invalid_client",
		});
	}
}

/**
 * Refetch JWKS from jwks_uri when signature verification fails with cached keys.
 * Handles key rotation: the client may have published a new key that isn't in our cache yet.
 */
async function refetchClientJwks(
	client: SchemaClient<Scope[]>,
): Promise<JSONWebKeySet | null> {
	if (!client.jwksUri) return null;
	try {
		const jwks = await fetchJwksFromUri(client.jwksUri);
		setJwksCache(client.jwksUri, jwks, Date.now());
		return jwks;
	} catch {
		return null;
	}
}

/**
 * Verifies a client assertion JWT for `private_key_jwt` authentication.
 *
 * Validates: signature, iss=client_id, sub=client_id, aud=token_endpoint,
 * exp, assertion max lifetime, jti uniqueness (replay prevention).
 */
export async function verifyClientAssertion(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	clientAssertion: string,
	clientAssertionType: string,
	clientIdHint?: string,
	expectedAudience?: string,
): Promise<{ clientId: string; client: SchemaClient<Scope[]> }> {
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
			error_description: "unknown client",
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

	// Fetch JWKS and verify signature + claims
	const jwks = await fetchClientJwks(ctx, client);
	const audience = expectedAudience ?? `${ctx.context.baseURL}/oauth2/token`;
	const maxLifetime = opts.assertionMaxLifetime ?? 300;
	const verifyOpts = {
		issuer: clientId,
		subject: clientId,
		audience,
		algorithms: ALGORITHMS_LIST,
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
			const refreshed = await refetchClientJwks(client);
			if (refreshed) {
				try {
					({ payload } = await jwtVerify(
						clientAssertion,
						createLocalJWKSet(refreshed),
						verifyOpts,
					));
				} catch {
					throw new APIError("UNAUTHORIZED", {
						error_description: "client assertion signature verification failed",
						error: "invalid_client",
					});
				}
			} else {
				throw new APIError("UNAUTHORIZED", {
					error_description: "client assertion signature verification failed",
					error: "invalid_client",
				});
			}
		} else {
			throw new APIError("UNAUTHORIZED", {
				error_description: "client assertion signature verification failed",
				error: "invalid_client",
			});
		}
	}

	// exp is REQUIRED per RFC 7523 Section 3 rule 4.
	// jose's jwtVerify only validates exp when present — it does NOT reject
	// assertions that omit exp entirely. We must enforce this explicitly.
	const now = Math.floor(Date.now() / 1000);
	if (typeof payload.exp !== "number") {
		throw new APIError("BAD_REQUEST", {
			error_description: "client assertion must include exp claim",
			error: "invalid_client",
		});
	}
	// Cap the assertion validity window: exp must not be more than
	// assertionMaxLifetime seconds from now (default 5 minutes).
	// This prevents long-lived assertions that could outlive JTI tombstones.
	if (payload.exp - now > maxLifetime) {
		throw new APIError("BAD_REQUEST", {
			error_description: `client assertion exp is too far in the future (max ${maxLifetime}s)`,
			error: "invalid_client",
		});
	}
	// Advisory iat check: when present, reject assertions older than maxLifetime.
	// iat is optional per RFC 7523 S3, so we only enforce when the client provides it.
	if (typeof payload.iat === "number" && now - payload.iat > maxLifetime) {
		throw new APIError("BAD_REQUEST", {
			error_description: `client assertion iat is too far in the past (max ${maxLifetime}s)`,
			error: "invalid_client",
		});
	}

	// jti is REQUIRED per OIDC Core Section 9 for private_key_jwt.
	// RFC 7523 Section 3 makes jti MAY, but OIDC tightens this to REQUIRED
	// with single-use enforcement.
	if (!payload.jti) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client assertion must include jti claim",
			error: "invalid_client",
		});
	}

	// Consume the jti with a single insert keyed by a digest of the per-client
	// assertion identifier. The primary key is the atomic gate on every adapter
	// (SQL primary key, MongoDB `_id`), so concurrent token requests across
	// workers cannot both pass. A duplicate-key failure means the jti was
	// already used (replay); any other failure is surfaced unchanged.
	const jtiDigest = await createHash("SHA-256").digest(
		new TextEncoder().encode(`private_key_jwt:${clientId}:${payload.jti}`),
	);
	const jtiId = base64Url.encode(new Uint8Array(jtiDigest).slice(0, 24), {
		padding: false,
	});
	try {
		await ctx.context.adapter.create({
			model: "oauthClientAssertion",
			data: {
				id: jtiId,
				expiresAt: new Date(payload.exp * 1000),
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

	return { clientId, client };
}
