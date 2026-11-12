/**
 * DPoP (RFC 9449) values and helpers that both proof verification and proof
 * creation need. This module must stay free of dependencies beyond WebCrypto,
 * because the `@better-auth/core/oauth2/dpop-client` subpath imports it in
 * browsers and other runtimes that do not install server peers.
 */

export const DPOP_AUTHORIZATION_SCHEME = "DPoP";
export const BEARER_AUTHORIZATION_SCHEME = "Bearer";
export const DPOP_PROOF_TYPE = "dpop+jwt";
/** The RFC 9449 §8 response header that carries a server-provided nonce. */
export const DPOP_NONCE_HEADER = "DPoP-Nonce";
/** The request header that carries a DPoP proof. */
export const DPOP_PROOF_HEADER = "DPoP";
/** The RFC 9449 error code a server returns when a proof needs a new nonce. */
export const DPOP_NONCE_ERROR = "use_dpop_nonce";

export const DPOP_SIGNING_ALGORITHMS = [
	"EdDSA",
	"ES256",
	"ES512",
	"PS256",
	"RS256",
] as const;

export type DpopSigningAlgorithm = (typeof DPOP_SIGNING_ALGORITHMS)[number];

export type AccessTokenAuthorizationScheme = "Bearer" | "DPoP" | "Unknown";

export interface AccessTokenAuthorization {
	scheme: AccessTokenAuthorizationScheme;
	token: string;
}

export function encodeBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
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
	return encodeBase64Url(new Uint8Array(digest));
}
