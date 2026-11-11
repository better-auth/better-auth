import { safeJSONParse } from "@better-auth/core/utils/json";
import type { CookieOptions } from "better-call";
import { serializeCookie } from "better-call";
import type { JWK } from "jose";
import { EmbeddedJWK, importJWK, jwtVerify } from "jose";
import { getDomain } from "tldts";

/**
 * Header and JSON names from the Device Bound Session Credentials
 * specification (W3C WebAppSec). Chrome ships these names.
 */
export const REGISTRATION_HEADER = "Secure-Session-Registration";
export const CHALLENGE_HEADER = "Secure-Session-Challenge";
export const RESPONSE_HEADER = "secure-session-response";
export const SESSION_ID_HEADER = "sec-secure-session-id";

const JWT_TYPE = "dbsc+jwt";
const SUPPORTED_ALGORITHMS = ["ES256", "RS256"] as const;
type SupportedAlgorithm = (typeof SUPPORTED_ALGORITHMS)[number];

/**
 * Reads a header value that may be sent as a structured-field string
 * (quoted) or raw. Chrome sends the session id and proof raw.
 */
export function readHeaderString(value: string | null | undefined) {
	if (!value) return null;
	const trimmed = value.trim();
	if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
		return trimmed.slice(1, -1).replace(/\\(["\\])/g, "$1");
	}
	return trimmed;
}

function quote(value: string) {
	return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

export function serializeRegistrationHeader(input: {
	path: string;
	challenge: string;
}) {
	return `(${SUPPORTED_ALGORITHMS.join(" ")});path=${quote(input.path)};challenge=${quote(input.challenge)}`;
}

export function serializeChallengeHeader(input: {
	challenge: string;
	sessionIdentifier: string;
}) {
	return `${quote(input.challenge)};id=${quote(input.sessionIdentifier)}`;
}

function toPublicJwk(jwk: JWK): JWK | null {
	if (jwk.kty === "EC" && jwk.crv === "P-256" && jwk.x && jwk.y) {
		return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
	}
	if (jwk.kty === "RSA" && jwk.n && jwk.e) {
		return { kty: "RSA", n: jwk.n, e: jwk.e };
	}
	return null;
}

function algorithmFor(jwk: JWK): SupportedAlgorithm {
	return jwk.kty === "EC" ? "ES256" : "RS256";
}

/**
 * Verifies a registration proof, which carries the device's new public key
 * in its protected header. Returns `null` for any invalid proof.
 */
export async function verifyRegistrationProof(jws: string) {
	try {
		const { payload, protectedHeader } = await jwtVerify(jws, EmbeddedJWK, {
			algorithms: [...SUPPORTED_ALGORITHMS],
			typ: JWT_TYPE,
		});
		const publicKey = protectedHeader.jwk && toPublicJwk(protectedHeader.jwk);
		if (!publicKey || !payload.jti) return null;
		if (algorithmFor(publicKey) !== protectedHeader.alg) return null;
		return { publicKey, jti: payload.jti };
	} catch {
		return null;
	}
}

/**
 * Verifies a refresh proof against the key stored at registration, never a
 * key supplied by the request. Returns the signed challenge, or `null`.
 */
export async function verifyRefreshProof(jws: string, publicKey: JWK) {
	try {
		const algorithm = algorithmFor(publicKey);
		const { payload } = await jwtVerify(
			jws,
			await importJWK(publicKey, algorithm),
			{ algorithms: [algorithm], typ: JWT_TYPE },
		);
		return payload.jti ?? null;
	} catch {
		return null;
	}
}

export function parseStoredPublicKey(value: unknown): JWK | null {
	const parsed = typeof value === "string" ? safeJSONParse<JWK>(value) : null;
	return parsed ? toPublicJwk(parsed) : null;
}

const CRAVING_ATTRIBUTES = new Set([
	"domain",
	"path",
	"secure",
	"httponly",
	"samesite",
]);

/**
 * The cookie attributes Chrome compares when deciding whether the bound
 * cookie is present, taken from the serialized cookie so they match what is
 * actually set. Chrome accepts only these five attributes here.
 */
export function serializeCookieAttributes(
	name: string,
	attributes: CookieOptions,
) {
	return serializeCookie(name, "", attributes)
		.split("; ")
		.slice(1)
		.filter((part) => CRAVING_ATTRIBUTES.has(part.split("=")[0]!.toLowerCase()))
		.join("; ");
}

const HOST_PATTERN = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*$/i;

/**
 * The registrable domain that makes a host's site, as browsers compute it from
 * the Public Suffix List, or the host itself when it has none (`localhost`).
 */
function siteOf(host: string) {
	return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

export function toRefreshInitiators(
	trustedOrigins: string[],
	authHost: string,
) {
	const site = siteOf(authHost);
	const hosts = new Set<string>();
	for (const origin of trustedOrigins) {
		const host = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/:?#]+)/i
			.exec(origin)?.[1]
			?.toLowerCase();
		if (
			host &&
			host !== authHost &&
			HOST_PATTERN.test(host) &&
			siteOf(host.replace(/^\*\./, "")) === site
		) {
			hosts.add(host);
		}
	}
	return [...hosts];
}
