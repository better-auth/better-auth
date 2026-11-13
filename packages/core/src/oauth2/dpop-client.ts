import type { Awaitable } from "../types/helper";
import type { DpopSigningAlgorithm } from "./dpop-protocol";
import {
	DPOP_AUTHORIZATION_SCHEME,
	DPOP_NONCE_ERROR,
	DPOP_NONCE_HEADER,
	DPOP_PROOF_HEADER,
	DPOP_PROOF_TYPE,
	deriveDpopAth,
	encodeBase64Url,
	normalizeDpopHtu,
	parseAccessTokenAuthorization,
} from "./dpop-protocol";

export { DPOP_NONCE_HEADER } from "./dpop-protocol";

const MAX_CACHED_NONCE_ORIGINS = 100;
const JTI_BYTES = 16;
// Fetch uppercases only these methods before sending (Fetch Standard
// "normalize a method"), so `htm` matches what goes on the wire.
const NORMALIZED_METHODS = new Set([
	"DELETE",
	"GET",
	"HEAD",
	"OPTIONS",
	"POST",
	"PUT",
]);

interface DpopSigner {
	alg: DpopSigningAlgorithm;
	params: AlgorithmIdentifier | EcdsaParams | RsaPssParams;
}

/**
 * A key pair that signs DPoP proofs. Any `CryptoKeyPair` from
 * `crypto.subtle.generateKey` fits.
 */
export interface DpopKeyPair {
	privateKey: CryptoKey;
	publicKey: CryptoKey;
}

/**
 * Generates a key pair for signing DPoP proofs: ECDSA P-256 (`ES256`) with a
 * non-extractable private key, so script running on the page can use the key
 * but cannot copy it elsewhere.
 *
 * Access tokens issued for a DPoP proof only work with the key that signed it,
 * so keep the pair for as long as the tokens live. In a browser, store the
 * `CryptoKeyPair` itself in IndexedDB: structured clone preserves a
 * non-extractable key.
 */
export async function generateDpopKeyPair(): Promise<DpopKeyPair> {
	return crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign", "verify"],
	);
}

// Only the algorithms in `DPOP_SIGNING_ALGORITHMS`, which Better Auth servers
// accept by default.
function resolveDpopSigner(privateKey: CryptoKey): DpopSigner {
	if (privateKey.type !== "private" || !privateKey.usages.includes("sign")) {
		throw new TypeError(
			"DPoP signing key must be a private key usable to sign",
		);
	}
	const algorithm = privateKey.algorithm as
		| EcKeyAlgorithm
		| RsaHashedKeyAlgorithm;
	const hash = "hash" in algorithm ? algorithm.hash.name : undefined;
	switch (algorithm.name) {
		case "ECDSA": {
			const curve = "namedCurve" in algorithm ? algorithm.namedCurve : "";
			if (curve === "P-256") {
				return { alg: "ES256", params: { name: "ECDSA", hash: "SHA-256" } };
			}
			if (curve === "P-521") {
				return { alg: "ES512", params: { name: "ECDSA", hash: "SHA-512" } };
			}
			break;
		}
		case "Ed25519":
			return { alg: "EdDSA", params: { name: "Ed25519" } };
		case "RSASSA-PKCS1-v1_5":
			if (hash !== "SHA-256") break;
			return { alg: "RS256", params: { name: "RSASSA-PKCS1-v1_5" } };
		case "RSA-PSS":
			if (hash !== "SHA-256") break;
			return { alg: "PS256", params: { name: "RSA-PSS", saltLength: 32 } };
	}
	throw new TypeError(
		`DPoP signing key algorithm ${algorithm.name} is not supported`,
	);
}

const publicJwkCache = new WeakMap<CryptoKey, Promise<JsonWebKey>>();

/** The public members RFC 7638 hashes for each key type, in sorted order. */
const REQUIRED_JWK_MEMBERS: Record<string, readonly (keyof JsonWebKey)[]> = {
	EC: ["crv", "kty", "x", "y"],
	OKP: ["crv", "kty", "x"],
	RSA: ["e", "kty", "n"],
};

async function exportDpopPublicJwk(publicKey: CryptoKey): Promise<JsonWebKey> {
	const exported = await crypto.subtle.exportKey("jwk", publicKey);
	const members = exported.kty ? REQUIRED_JWK_MEMBERS[exported.kty] : undefined;
	if (!members) {
		throw new TypeError("DPoP public key must be an EC, OKP, or RSA key");
	}
	// Only the required members: the header must not carry `ext`, `key_ops`,
	// or anything private, and the thumbprint is computed over these alone.
	const jwk: JsonWebKey = {};
	for (const member of members) {
		const value = exported[member];
		if (typeof value !== "string") {
			throw new TypeError(`DPoP public key JWK is missing "${member}"`);
		}
		Object.assign(jwk, { [member]: value });
	}
	return jwk;
}

function getDpopPublicJwk(publicKey: CryptoKey): Promise<JsonWebKey> {
	if (publicKey.type !== "public") {
		return Promise.reject(new TypeError("DPoP public key must be public"));
	}
	let jwk = publicJwkCache.get(publicKey);
	if (!jwk) {
		jwk = exportDpopPublicJwk(publicKey);
		publicJwkCache.set(publicKey, jwk);
		jwk.catch(() => publicJwkCache.delete(publicKey));
	}
	return jwk;
}

function encodeJson(value: unknown): string {
	return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/**
 * Returns the RFC 7638 SHA-256 thumbprint of the key pair's public key, the
 * value a server stores as `cnf.jkt` and the one to send as `dpop_jkt` on an
 * authorization request (RFC 9449 §10).
 */
export async function deriveDpopKeyJkt(keyPair: DpopKeyPair): Promise<string> {
	const jwk = await getDpopPublicJwk(keyPair.publicKey);
	// The members are already in the lexicographic order RFC 7638 requires.
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(JSON.stringify(jwk)),
	);
	return encodeBase64Url(new Uint8Array(digest));
}

export interface CreateDpopProofParams {
	/**
	 * The key pair that signs the proof: ECDSA P-256 (`ES256`) or P-521
	 * (`ES512`), Ed25519 (`EdDSA`), or a SHA-256 RSASSA-PKCS1-v1_5 (`RS256`) or
	 * RSA-PSS (`PS256`) key. The public key must be extractable, which it is for
	 * any pair from `crypto.subtle.generateKey`.
	 */
	keyPair: DpopKeyPair;
	/**
	 * The HTTP method of the request, sent as `htm`. Standard methods are
	 * uppercased the way `fetch` sends them.
	 */
	method: string;
	/**
	 * The request URL. The proof's `htu` drops its query and fragment
	 * (RFC 9449 §4.2).
	 */
	url: string | URL;
	/**
	 * The access token the request sends. Required for requests to a resource
	 * server: the proof then carries its hash as `ath` (RFC 9449 §7).
	 */
	accessToken?: string;
	/** The latest nonce the server sent in its `DPoP-Nonce` header. */
	nonce?: string;
}

/**
 * Creates a DPoP proof (RFC 9449 §4) for one request, to send in the `DPoP`
 * request header. Each call creates a new `jti`, so never reuse a proof.
 *
 * Most callers should use {@link createDpopFetch}, which also tracks nonces.
 */
export async function createDpopProof({
	keyPair,
	method,
	url,
	accessToken,
	nonce,
}: CreateDpopProofParams): Promise<string> {
	const signer = resolveDpopSigner(keyPair.privateKey);
	const target = new URL(url);
	target.hash = "";
	const jti = encodeBase64Url(
		crypto.getRandomValues(new Uint8Array(JTI_BYTES)),
	);
	const header = {
		alg: signer.alg,
		typ: DPOP_PROOF_TYPE,
		jwk: await getDpopPublicJwk(keyPair.publicKey),
	};
	const payload = {
		jti,
		htm: NORMALIZED_METHODS.has(method.toUpperCase())
			? method.toUpperCase()
			: method,
		htu: normalizeDpopHtu(target.href),
		iat: Math.floor(Date.now() / 1000),
		...(accessToken !== undefined
			? { ath: await deriveDpopAth(accessToken) }
			: {}),
		...(nonce !== undefined ? { nonce } : {}),
	};
	const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`;
	// WebCrypto ECDSA signatures are already the raw `r || s` form JWS uses.
	const signature = await crypto.subtle.sign(
		signer.params,
		keyPair.privateKey,
		new TextEncoder().encode(signingInput),
	);
	return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

/**
 * Holds the latest server-provided DPoP nonce for each origin.
 *
 * An authorization server and a resource server issue nonces independently,
 * so a single shared value would make each overwrite the other's and cost a
 * retry on every switch. Methods may return promises, for example to persist
 * nonces in IndexedDB.
 */
export interface DpopNonceCache {
	get: (origin: string) => Awaitable<string | undefined>;
	set: (origin: string, nonce: string) => Awaitable<void>;
}

/**
 * Creates an in-memory {@link DpopNonceCache} that keeps the nonces of the
 * 100 most recently updated origins.
 */
export function createDpopNonceCache(): DpopNonceCache {
	const nonces = new Map<string, string>();
	return {
		get: (origin) => nonces.get(origin),
		set(origin, nonce) {
			nonces.delete(origin);
			nonces.set(origin, nonce);
			if (nonces.size > MAX_CACHED_NONCE_ORIGINS) {
				const oldest = nonces.keys().next().value;
				if (oldest !== undefined) nonces.delete(oldest);
			}
		},
	};
}

const AUTH_TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const AUTH_PARAM = new RegExp(
	`^(${AUTH_TOKEN})\\s*=\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|(${AUTH_TOKEN}))`,
);
const AUTH_SCHEME = new RegExp(`^${AUTH_TOKEN}`);

function hasDpopNonceChallenge(wwwAuthenticate: string | null): boolean {
	if (!wwwAuthenticate) return false;
	let rest = wwwAuthenticate;
	let scheme: string | undefined;
	while (rest) {
		rest = rest.replace(/^[\s,]+/, "");
		const param = AUTH_PARAM.exec(rest);
		if (param) {
			const name = param[1]?.toLowerCase();
			const value = param[2]?.replace(/\\(.)/g, "$1") ?? param[3];
			if (scheme === "dpop" && name === "error" && value === DPOP_NONCE_ERROR) {
				return true;
			}
			rest = rest.slice(param[0].length);
			continue;
		}
		const token = AUTH_SCHEME.exec(rest);
		if (token) {
			scheme = token[0].toLowerCase();
			rest = rest.slice(token[0].length);
		} else {
			// Skip anything else, such as token68 padding.
			rest = rest.slice(1);
		}
	}
	return false;
}

/**
 * Returns whether a response asks the client to retry with a server-provided
 * DPoP nonce: a 400 whose JSON body has `error: "use_dpop_nonce"`, as a token
 * endpoint sends (RFC 9449 §8), or a 401 with a
 * `WWW-Authenticate: DPoP error="use_dpop_nonce"` challenge, as a resource
 * server sends (RFC 9449 §9).
 *
 * Reads a clone of the body, so the response stays readable. The new nonce
 * is in the response's `DPoP-Nonce` header. {@link createDpopFetch} already
 * retries these responses; use this when you run your own request loop.
 */
export async function isDpopNonceError(response: Response): Promise<boolean> {
	if (response.status === 401) {
		return hasDpopNonceChallenge(response.headers.get("WWW-Authenticate"));
	}
	if (response.status !== 400) return false;
	try {
		const body: unknown = await response.clone().json();
		return (
			typeof body === "object" &&
			body !== null &&
			"error" in body &&
			body.error === DPOP_NONCE_ERROR
		);
	} catch {
		return false;
	}
}

export type DpopFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export interface CreateDpopFetchOptions {
	/** The key pair that signs every proof. See {@link generateDpopKeyPair}. */
	keyPair: DpopKeyPair;
	/**
	 * The fetch implementation to send requests with. It is called as a plain
	 * function, so bind a method first, such as
	 * `env.SERVICE.fetch.bind(env.SERVICE)` for a Cloudflare service binding.
	 *
	 * @default globalThis.fetch
	 */
	fetch?: DpopFetch;
	/**
	 * Where to keep server nonces. Pass the same cache to every fetcher that
	 * uses the same key, so they share what each server last sent.
	 *
	 * @default createDpopNonceCache()
	 */
	nonceCache?: DpopNonceCache;
}

function hasStreamedBody(
	input: string | URL | Request,
	init: RequestInit | undefined,
): boolean {
	if (init?.body != null) return init.body instanceof ReadableStream;
	return input instanceof Request && input.body !== null;
}

/**
 * Creates a `fetch` that adds a DPoP proof to every request and handles
 * server-provided nonces (RFC 9449 §8 and §9).
 *
 * - When the request has an `Authorization: DPoP <token>` header, the proof
 *   carries the token's hash as `ath`.
 * - Each proof carries the latest nonce the request's origin sent, and every
 *   `DPoP-Nonce` response header updates it, including on success.
 * - On a `use_dpop_nonce` error that comes with a new nonce, the request is
 *   sent once more with a new proof. Any other response is returned as is.
 *   A streamed body, or a `Request` input that has a body, is sent once and
 *   never retried, so the upload is not buffered in memory.
 * - The proof names the requested URL. When `fetch` follows a redirect, the
 *   target receives a proof for a different `htu` and rejects it.
 *
 * @example
 * ```ts
 * const keyPair = await generateDpopKeyPair();
 * const dpopFetch = createDpopFetch({ keyPair });
 * const response = await dpopFetch("https://api.example.com/items", {
 * 	headers: { Authorization: `DPoP ${accessToken}` },
 * });
 * ```
 */
export function createDpopFetch(options: CreateDpopFetchOptions): DpopFetch {
	const { keyPair } = options;
	const fetchImpl: DpopFetch =
		options.fetch ?? ((input, init) => globalThis.fetch(input, init));
	const nonceCache = options.nonceCache ?? createDpopNonceCache();
	// Fail at setup on a key that cannot sign proofs, not on the first request.
	resolveDpopSigner(keyPair.privateKey);

	return async (input, init) => {
		const request = new Request(input, init);
		const origin = new URL(request.url).origin;
		const authorization = parseAccessTokenAuthorization(
			request.headers.get("Authorization"),
		);
		const accessToken =
			authorization?.scheme === DPOP_AUTHORIZATION_SCHEME
				? authorization.token
				: undefined;

		// A body already in memory is rebuilt for each attempt. A streamed body
		// can be read only once, and buffering it for a retry would hold the
		// whole upload in memory, so it is sent once and never retried.
		const replayable = !hasStreamedBody(input, init);

		const send = async (nonce: string | undefined) => {
			const attempt = replayable ? new Request(input, init) : request;
			attempt.headers.set(
				DPOP_PROOF_HEADER,
				await createDpopProof({
					keyPair,
					method: request.method,
					url: request.url,
					accessToken,
					nonce,
				}),
			);
			const response = await fetchImpl(attempt);
			const nextNonce = response.headers.get(DPOP_NONCE_HEADER) ?? undefined;
			// After a redirect the nonce belongs to the server that answered.
			const responseOrigin =
				response.redirected && response.url
					? new URL(response.url).origin
					: origin;
			if (nextNonce) await nonceCache.set(responseOrigin, nextNonce);
			if (responseOrigin !== origin) return { response, nextNonce: undefined };
			return { response, nextNonce };
		};

		const sentNonce = await nonceCache.get(origin);
		const first = await send(sentNonce);
		// Retry only with a nonce the rejected proof did not already carry:
		// the same nonce would fail again.
		if (
			!replayable ||
			!first.nextNonce ||
			first.nextNonce === sentNonce ||
			!(await isDpopNonceError(first.response))
		) {
			return first.response;
		}
		await first.response.body?.cancel().catch(() => {});
		return (await send(first.nextNonce)).response;
	};
}
