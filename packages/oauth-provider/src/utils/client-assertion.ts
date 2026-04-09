import type { GenericEndpointContext } from "@better-auth/core";
import type { AssertionSigningAlgorithm } from "@better-auth/core/oauth2";
import { ASSERTION_SIGNING_ALGORITHMS } from "@better-auth/core/oauth2";
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

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

// JWKS URI cache with 5-minute TTL
const jwksCache = new Map<string, { jwks: JSONWebKeySet; fetchedAt: number }>();
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5_000;
const pendingAssertionIds = new Set<string>();

/**
 * Block SSRF: reject jwks_uri pointing at private/reserved IP ranges.
 * Only HTTPS with public hostnames is allowed.
 */
function isPrivateIpv4(hostname: string): boolean {
	const parts = hostname.split(".");
	if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) {
		return false;
	}
	const octets = parts.map(Number);
	const a = octets[0]!;
	const b = octets[1]!;
	return (
		a === 10 ||
		a === 0 ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 169 && b === 254) ||
		a === 127
	);
}

export function isPrivateHostname(hostname: string): boolean {
	const lower = hostname.toLowerCase();
	// Strip IPv6 brackets for uniform prefix matching
	const host =
		lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;

	if (host === "localhost" || host === "::1") {
		return true;
	}
	if (isPrivateIpv4(host)) {
		return true;
	}
	// Only apply IPv6 heuristics when the hostname contains ":" (the IPv6
	// separator). Without this gate, DNS names like "fdomain.com" would be
	// incorrectly blocked by the "fd" prefix check.
	if (host.includes(":")) {
		// IPv4-mapped IPv6 (::ffff:a.b.c.d): extract the trailing IPv4 and check it
		const v4MappedMatch = host.match(
			/^(?:0{0,4}:){0,4}:?(?:0{0,4}:)?ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/,
		);
		if (v4MappedMatch && isPrivateIpv4(v4MappedMatch[1]!)) {
			return true;
		}
		// Link-local IPv6: fe80::/10 covers fe8*-feb*
		const isLinkLocal =
			host.startsWith("fe8") ||
			host.startsWith("fe9") ||
			host.startsWith("fea") ||
			host.startsWith("feb");
		// Unique-local IPv6: fc00::/7 covers fc* and fd*
		const isUniqueLocal = host.startsWith("fc") || host.startsWith("fd");
		if (isLinkLocal || isUniqueLocal) {
			return true;
		}
	}
	if (host === "metadata.google.internal") {
		return true;
	}
	return false;
}

function validateJwksUri(ctx: GenericEndpointContext, jwksUri: string): void {
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
	if (!ctx.context.isTrustedOrigin(parsed.href)) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client jwks_uri is not trusted",
			error: "invalid_client",
		});
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

	validateJwksUri(ctx, client.jwksUri);

	const now = Date.now();
	const cached = jwksCache.get(client.jwksUri);
	if (cached && now - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
		return cached.jwks;
	}

	try {
		const jwks = await fetchJwksFromUri(client.jwksUri);
		jwksCache.set(client.jwksUri, { jwks, fetchedAt: now });
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
		jwksCache.set(client.jwksUri, { jwks, fetchedAt: Date.now() });
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
	if (clientAssertionType !== ASSERTION_TYPE) {
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
	if (
		!header.alg ||
		!ASSERTION_SIGNING_ALGORITHMS.includes(
			header.alg as AssertionSigningAlgorithm,
		)
	) {
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
		algorithms: [...ASSERTION_SIGNING_ALGORITHMS] as string[],
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
	} catch {
		// On failure for jwks_uri clients, the key may have been rotated.
		// Refetch JWKS and retry once before giving up.
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

	const jtiIdentifier = `private_key_jwt:${clientId}:${payload.jti}`;
	if (pendingAssertionIds.has(jtiIdentifier)) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client assertion jti has already been used",
			error: "invalid_client",
		});
	}

	pendingAssertionIds.add(jtiIdentifier);
	try {
		const existingJti =
			await ctx.context.internalAdapter.findVerificationValue(jtiIdentifier);
		if (existingJti) {
			throw new APIError("BAD_REQUEST", {
				error_description: "client assertion jti has already been used",
				error: "invalid_client",
			});
		}

		// Store JTI tombstone until the assertion's actual expiry.
		// If another instance created the tombstone between our find and create
		// (race in multi-instance deployments), the create may succeed as a
		// duplicate or throw; either way the assertion is consumed.
		const jtiExpiry = new Date(payload.exp * 1000);
		try {
			await ctx.context.internalAdapter.createVerificationValue({
				identifier: jtiIdentifier,
				value: clientId,
				expiresAt: jtiExpiry,
			});
		} catch (createErr) {
			// If the tombstone already exists (created by another instance in
			// the race window), treat it as a replay.
			const doubleCheck =
				await ctx.context.internalAdapter.findVerificationValue(jtiIdentifier);
			if (doubleCheck) {
				throw new APIError("BAD_REQUEST", {
					error_description: "client assertion jti has already been used",
					error: "invalid_client",
				});
			}
			throw createErr;
		}
	} finally {
		pendingAssertionIds.delete(jtiIdentifier);
	}

	return { clientId, client };
}
