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

export type AccessTokenAuthorizationScheme = "Bearer" | "DPoP" | "Raw";

export interface AccessTokenAuthorization {
	scheme: AccessTokenAuthorizationScheme;
	token: string;
}

export type DpopProofErrorCode = "invalid_dpop_proof" | "use_dpop_nonce";

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

export interface VerifyDpopProofOptions {
	proofJwt: string;
	method: string;
	url: string;
	accessToken?: string;
	expectedJkt?: string;
	expectedNonce?: string;
	requireAth?: boolean;
	nowSeconds?: number;
	maxAgeSeconds?: number;
	supportedAlgorithms?: readonly string[];
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
	nonce?: string;
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
		(error.code === "invalid_dpop_proof" || error.code === "use_dpop_nonce")
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
		return { scheme: "Raw", token: value };
	}
	const scheme = match[1] ?? "";
	const token = match[2]?.trim() ?? "";
	if (scheme.toLowerCase() === "bearer") {
		return { scheme: "Bearer", token };
	}
	if (scheme.toLowerCase() === "dpop") {
		return { scheme: "DPoP", token };
	}
	return { scheme: "Raw", token: value };
}

export function stripAccessTokenAuthorizationScheme(token: string): string {
	return parseAccessTokenAuthorization(token)?.token ?? token;
}

export function normalizeDpopHtu(url: string): string {
	const parsed = new URL(url);
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

export function getDpopJktFromPayload(payload: JWTPayload): string | undefined {
	const cnf = payload.cnf;
	if (!cnf || typeof cnf !== "object" || Array.isArray(cnf)) return undefined;
	const jkt = (cnf as Record<string, unknown>).jkt;
	return typeof jkt === "string" && jkt.length > 0 ? jkt : undefined;
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
	supportedAlgorithms: readonly string[],
) {
	if (!alg || alg === "none" || alg.startsWith("HS")) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof must use an asymmetric JWS algorithm",
		);
	}
	if (!supportedAlgorithms.includes(alg)) {
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
	expectedNonce,
	requireAth = false,
	nowSeconds = Math.floor(Date.now() / 1000),
	maxAgeSeconds = DEFAULT_DPOP_PROOF_MAX_AGE_SECONDS,
	supportedAlgorithms = DPOP_SIGNING_ALGORITHMS,
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
	assertSupportedDpopAlgorithm(protectedHeader.alg, supportedAlgorithms);
	assertPublicJwk(protectedHeader.jwk);

	const publicKey = await importJWK(protectedHeader.jwk, protectedHeader.alg);
	let payload: JWTPayload;
	try {
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
	if (iat > nowSeconds + 5 || nowSeconds - iat > maxAgeSeconds) {
		throw createDpopProofError(
			"invalid_dpop_proof",
			"DPoP proof iat is outside the accepted window",
		);
	}

	const nonce = getStringClaim(payload, "nonce");
	if (expectedNonce !== undefined && nonce !== expectedNonce) {
		throw createDpopProofError(
			"use_dpop_nonce",
			"DPoP proof nonce is required or invalid",
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

	const replayKey = await deriveDpopReplayKey({ jkt, htm, htu, jti });
	const expiresAt = new Date((iat + maxAgeSeconds) * 1000);
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
		ath,
		nonce,
		replayKey,
		expiresAt,
	};
}
