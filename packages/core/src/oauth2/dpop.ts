import type { JWK, JWTPayload } from "jose";
import {
	base64url,
	calculateJwkThumbprint,
	decodeProtectedHeader,
	importJWK,
	jwtVerify,
} from "jose";

export const DPOP_AUTHORIZATION_SCHEME = "DPoP";
export const BEARER_AUTHORIZATION_SCHEME = "Bearer";
export const DPOP_PROOF_TYPE = "dpop+jwt";

export const DPOP_SIGNING_ALGORITHMS = [
	"EdDSA",
	"ES256",
	"ES512",
	"PS256",
	"RS256",
] as const;

const DEFAULT_DPOP_PROOF_MAX_AGE_SECONDS = 300;
const MAX_DPOP_JTI_LENGTH = 512;

const JWK_PRIVATE_FIELDS = new Set([
	"d",
	"p",
	"q",
	"dp",
	"dq",
	"qi",
	"oth",
	"k",
]);

export type DpopSigningAlgorithm = (typeof DPOP_SIGNING_ALGORITHMS)[number];

export type AccessTokenAuthorizationScheme = "Bearer" | "DPoP" | "Unknown";

export interface AccessTokenAuthorization {
	scheme: AccessTokenAuthorizationScheme;
	token: string;
}

export type DpopProofErrorCode = "invalid_dpop_proof";

export type DpopProofError = Error & {
	code: DpopProofErrorCode;
};

export interface DpopReplayReservation {
	key: string;
	expiresAt: Date;
	now: Date;
}

export interface DpopReplayStore {
	reserve: (reservation: DpopReplayReservation) => Promise<boolean> | boolean;
}

export function createInMemoryDpopReplayStore(): DpopReplayStore {
	const reservations = new Map<string, number>();
	return {
		reserve({ key, expiresAt, now }) {
			const nowMs = now.getTime();
			for (const [storedKey, expiresAtMs] of reservations) {
				if (expiresAtMs <= nowMs) {
					reservations.delete(storedKey);
				}
			}
			if (reservations.has(key)) return false;
			reservations.set(key, expiresAt.getTime());
			return true;
		},
	};
}

/**
 * The single-use reservation capability a {@link createDpopReplayStore} needs:
 * the auth context's `internalAdapter.reserveVerificationValue`. Kept structural
 * so core does not depend on the adapter implementation.
 */
export interface DpopReplayReservations {
	reserveVerificationValue: (data: {
		identifier: string;
		value: string;
		expiresAt: Date;
	}) => Promise<boolean>;
}

/**
 * Database-backed DPoP proof replay store built on the auth context's
 * verification reservation primitive (`internalAdapter.reserveVerificationValue`),
 * the same atomic single-use mechanism that guards SAML assertion ids and other
 * one-time tokens. A replayed proof collides on the deterministic reservation id
 * so `reserve` returns `false`, giving cross-instance anti-replay. Prefer this
 * over {@link createInMemoryDpopReplayStore} for any multi-instance or serverless
 * resource server. Requires database-backed verification storage; a
 * secondary-storage-only deployment rejects the proof (fails closed).
 */
export function createDpopReplayStore(
	reservations: DpopReplayReservations,
): DpopReplayStore {
	return {
		reserve: ({ key, expiresAt }) =>
			reservations.reserveVerificationValue({
				identifier: `dpop-proof:${key}`,
				value: key,
				expiresAt,
			}),
	};
}

export interface VerifyDpopProofOptions {
	proofJwt: string;
	method: string;
	url: string;
	accessToken?: string;
	expectedJkt?: string;
	requireAth?: boolean;
	nowSeconds?: number;
	proofMaxAgeSeconds?: number;
	signingAlgorithms?: readonly string[];
	replayStore?: DpopReplayStore;
}

export interface VerifiedDpopProof {
	jwk: JWK;
	jkt: string;
	jti: string;
	htm: string;
	htu: string;
	iat: number;
	ath?: string;
	replayKey: string;
	expiresAt: Date;
}

export function createDpopProofError(
	code: DpopProofErrorCode,
	message: string,
): DpopProofError {
	return Object.assign(new Error(message), { code });
}

export function isDpopProofError(error: unknown): error is DpopProofError {
	return (
		error instanceof Error &&
		"code" in error &&
		error.code === "invalid_dpop_proof"
	);
}

export function parseAccessTokenAuthorization(
	authorization: string | null | undefined,
): AccessTokenAuthorization | undefined {
	if (!authorization) return undefined;
	const value = authorization.trim();
	if (!value) return undefined;
	const match = /^([A-Za-z][A-Za-z0-9!#$%&'*+.^_`|~-]*)\s+(.+)$/.exec(value);
	if (!match) {
		return { scheme: "Unknown", token: value };
	}
	const scheme = match[1] ?? "";
	const token = match[2]?.trim() ?? "";
	if (scheme.toLowerCase() === "bearer") {
		return { scheme: "Bearer", token };
	}
	if (scheme.toLowerCase() === "dpop") {
		return { scheme: "DPoP", token };
	}
	return { scheme: "Unknown", token: value };
}

export function stripAccessTokenAuthorizationScheme(token: string): string {
	return parseAccessTokenAuthorization(token)?.token ?? token;
}

export function normalizeDpopHtu(url: string): string {
	const parsed = new URL(url);
	// RFC 9449 §4.2: `htu` is the target URI without query and fragment parts.
	// Reject a fragment rather than silently strip it, so a malformed proof
	// fails fast instead of matching a request URL it does not actually name.
	if (parsed.hash) {
		throw new Error("DPoP proof htu must not contain a fragment");
	}
	return `${parsed.origin}${parsed.pathname}`;
}

export async function deriveDpopAth(accessToken: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(accessToken),
	);
	return base64url.encode(new Uint8Array(digest));
}

export async function deriveDpopJkt(jwk: JWK): Promise<string> {
	return calculateJwkThumbprint(jwk, "sha256");
}

/**
 * Extracts the DPoP key thumbprint from an RFC 7800 `cnf` confirmation. The
 * input is untrusted (a JWT claim, a JSON column), so any shape other than an
 * object carrying a non-empty string `jkt` (a primitive, an array, a different
 * confirmation method such as mTLS `x5t#S256`) yields `undefined` instead of
 * throwing.
 */
export function getConfirmationJkt(confirmation: unknown): string | undefined {
	if (
		!confirmation ||
		typeof confirmation !== "object" ||
		Array.isArray(confirmation)
	) {
		return undefined;
	}
	const jkt = (confirmation as Record<string, unknown>).jkt;
	return typeof jkt === "string" && jkt.length > 0 ? jkt : undefined;
}

export function getDpopJktFromPayload(payload: JWTPayload): string | undefined {
	return getConfirmationJkt(payload.cnf);
}

function getStringClaim(
	payload: JWTPayload,
	claim: string,
): string | undefined {
	const value = payload[claim];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNumberClaim(
	payload: JWTPayload,
	claim: string,
): number | undefined {
	const value = payload[claim];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function assertSupportedDpopAlgorithm(
	alg: string | undefined,
	signingAlgorithms: readonly string[],
) {
	if (!alg || alg === "none" || alg.startsWith("HS")) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof must use an asymmetric JWS algorithm",
		);
	}
	if (!signingAlgorithms.includes(alg)) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof uses an unsupported JWS algorithm",
		);
	}
}

function assertPublicJwk(jwk: JWK | undefined): asserts jwk is JWK {
	if (!jwk || typeof jwk !== "object" || Array.isArray(jwk)) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof header must include a public jwk",
		);
	}
	if (jwk.kty === "oct") {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof jwk must be asymmetric",
		);
	}
	for (const field of JWK_PRIVATE_FIELDS) {
		if (field in jwk) {
			throw createDpopProofError(
				"invalid_dpop_proof",
				"DPoP proof jwk must not contain private key material",
			);
		}
	}
}

async function deriveDpopReplayKey(params: {
	jkt: string;
	htm: string;
	htu: string;
	jti: string;
}): Promise<string> {
	const input = `${params.jkt}\n${params.htm}\n${params.htu}\n${params.jti}`;
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return base64url.encode(new Uint8Array(digest));
}

async function reserveDpopReplay(
	replayStore: DpopReplayStore | undefined,
	reservation: DpopReplayReservation,
) {
	if (!replayStore) return;
	const reserved = await replayStore.reserve(reservation);
	if (!reserved) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof jti has already been used",
		);
	}
}

export async function verifyDpopProof({
	proofJwt,
	method,
	url,
	accessToken,
	expectedJkt,
	requireAth = false,
	nowSeconds = Math.floor(Date.now() / 1000),
	proofMaxAgeSeconds = DEFAULT_DPOP_PROOF_MAX_AGE_SECONDS,
	signingAlgorithms = DPOP_SIGNING_ALGORITHMS,
	replayStore,
}: VerifyDpopProofOptions): Promise<VerifiedDpopProof> {
	if (!proofJwt || proofJwt.split(".").length !== 3) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof must be a compact JWT",
		);
	}

	let protectedHeader: ReturnType<typeof decodeProtectedHeader>;
	try {
		protectedHeader = decodeProtectedHeader(proofJwt);
	} catch (error) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			error instanceof Error ? error.message : "DPoP proof header is invalid",
		);
	}
	if (protectedHeader.typ !== DPOP_PROOF_TYPE) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			'DPoP proof typ must be "dpop+jwt"',
		);
	}
	assertSupportedDpopAlgorithm(protectedHeader.alg, signingAlgorithms);
	assertPublicJwk(protectedHeader.jwk);

	let payload: JWTPayload;
	try {
		// `importJWK` is inside the try: a structurally-valid header `jwk` can
		// still fail to import (bad curve, malformed `x`/`y`), and that is bad
		// client input, not a server error.
		const publicKey = await importJWK(protectedHeader.jwk, protectedHeader.alg);
		const verified = await jwtVerify(proofJwt, publicKey, {
			typ: DPOP_PROOF_TYPE,
		});
		payload = verified.payload;
	} catch (error) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			error instanceof Error
				? error.message
				: "DPoP proof signature is invalid",
		);
	}

	const htm = getStringClaim(payload, "htm");
	const htu = getStringClaim(payload, "htu");
	const jti = getStringClaim(payload, "jti");
	const iat = getNumberClaim(payload, "iat");
	if (!htm || !htu || !jti || iat === undefined) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof must include htm, htu, jti, and iat claims",
		);
	}
	if (jti.length > MAX_DPOP_JTI_LENGTH) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof jti is too large",
		);
	}
	if (htm.toUpperCase() !== method.toUpperCase()) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof htm does not match the request method",
		);
	}
	let normalizedHtu: string;
	let proofHtu: string;
	try {
		normalizedHtu = normalizeDpopHtu(url);
		proofHtu = normalizeDpopHtu(htu);
	} catch (error) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			error instanceof Error ? error.message : "DPoP proof htu is invalid",
		);
	}
	if (proofHtu !== normalizedHtu) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof htu does not match the request URL",
		);
	}
	if (iat > nowSeconds + 5 || nowSeconds - iat > proofMaxAgeSeconds) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof iat is outside the accepted window",
		);
	}

	const ath = getStringClaim(payload, "ath");
	if (requireAth && !ath) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof must include an ath claim",
		);
	}
	if (accessToken !== undefined) {
		const expectedAth = await deriveDpopAth(accessToken);
		if (ath !== expectedAth) {
			throw createDpopProofError(
				"invalid_dpop_proof",
				"DPoP proof ath does not match the access token",
			);
		}
	}

	const jkt = await deriveDpopJkt(protectedHeader.jwk);
	if (expectedJkt !== undefined && jkt !== expectedJkt) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof key does not match the bound token",
		);
	}

	// Key the replay record on the canonical method and normalized URL that
	// verification actually compared against, not the raw claim values. Otherwise
	// the same `jti` could be reused with different `htm` casing or a different
	// `htu` query string that normalizes equal, bypassing replay protection.
	const replayKey = await deriveDpopReplayKey({
		jkt,
		htm: htm.toUpperCase(),
		htu: normalizedHtu,
		jti,
	});
	const expiresAt = new Date((iat + proofMaxAgeSeconds) * 1000);
	await reserveDpopReplay(replayStore, {
		key: replayKey,
		expiresAt,
		now: new Date(nowSeconds * 1000),
	});

	return {
		jwk: protectedHeader.jwk,
		jkt,
		jti,
		htm,
		htu: normalizedHtu,
		iat,
		...(ath !== undefined ? { ath } : {}),
		replayKey,
		expiresAt,
	};
}

export type DpopBindingErrorCode = "invalid_token" | "invalid_dpop_proof";

export type DpopBindingError = Error & {
	code: DpopBindingErrorCode;
};

export function createDpopBindingError(
	code: DpopBindingErrorCode,
	message: string,
): DpopBindingError {
	return Object.assign(new Error(message), { code });
}

export function isDpopBindingError(error: unknown): error is DpopBindingError {
	return (
		error instanceof Error &&
		"code" in error &&
		(error.code === "invalid_token" || error.code === "invalid_dpop_proof")
	);
}

export interface EnforceDpopBindingParams {
	/** The already-verified access-token payload (from JWKS or introspection). */
	payload: JWTPayload;
	/** The parsed `Authorization` header (scheme + token). */
	authorization: AccessTokenAuthorization;
	/** The `DPoP` proof header value, if any. */
	proofJwt: string | null | undefined;
	method: string;
	url: string;
	replayStore?: DpopReplayStore;
	proofMaxAgeSeconds?: number;
	signingAlgorithms?: readonly string[];
}

/**
 * Enforces the RFC 9449 §7.1 sender-constraint check for a resource request,
 * given an access-token payload that has already been validated (by JWKS or
 * introspection). This is the single source of truth for the
 * "is the token DPoP-bound? then require the DPoP scheme, a proof, and a
 * matching key" decision, shared by every resource-server entry point.
 *
 * Throws a {@link DpopBindingError} on any mismatch so callers map the
 * `invalid_token` / `invalid_dpop_proof` code into their own transport. Returns
 * normally for a valid bearer token (no `cnf.jkt`, no DPoP scheme).
 */
export async function enforceDpopBinding({
	payload,
	authorization,
	proofJwt,
	method,
	url,
	replayStore,
	proofMaxAgeSeconds,
	signingAlgorithms,
}: EnforceDpopBindingParams): Promise<void> {
	const dpopJkt = getDpopJktFromPayload(payload);

	if (!dpopJkt) {
		if (authorization.scheme === "DPoP") {
			throw createDpopBindingError(
				"invalid_token",
				"DPoP authorization requires a DPoP-bound access token",
			);
		}
		return;
	}

	if (authorization.scheme !== "DPoP") {
		throw createDpopBindingError(
			"invalid_token",
			"DPoP-bound access token requires the DPoP authorization scheme",
		);
	}
	if (!proofJwt) {
		throw createDpopBindingError(
			"invalid_dpop_proof",
			"DPoP proof header is required",
		);
	}

	try {
		await verifyDpopProof({
			proofJwt,
			method,
			url,
			accessToken: authorization.token,
			expectedJkt: dpopJkt,
			requireAth: true,
			...(proofMaxAgeSeconds !== undefined ? { proofMaxAgeSeconds } : {}),
			...(signingAlgorithms !== undefined ? { signingAlgorithms } : {}),
			...(replayStore !== undefined ? { replayStore } : {}),
		});
	} catch (error) {
		if (isDpopProofError(error)) {
			throw createDpopBindingError("invalid_dpop_proof", error.message);
		}
		throw error;
	}
}
