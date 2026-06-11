import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-call";
import type {
	JSONWebKeySet,
	JWTPayload,
	JWTVerifyOptions,
	ProtectedHeaderParameters,
} from "jose";
import {
	createLocalJWKSet,
	decodeProtectedHeader,
	errors as joseErrors,
	jwtVerify,
	UnsecuredJWT,
} from "jose";
import { logger } from "../env";

const joseInfrastructureErrorCodes = new Set([
	joseErrors.JWKSTimeout.code,
	joseErrors.JWKSInvalid.code,
	joseErrors.JWKSMultipleMatchingKeys.code,
]);

function isJoseInfrastructureError(error: joseErrors.JOSEError) {
	return joseInfrastructureErrorCodes.has(error.code);
}

interface JwksCacheEntry {
	jwks: JSONWebKeySet;
	fetchedAt: number;
}

/**
 * @internal
 */
export const jwksCache = new Map<string, JwksCacheEntry>();

/**
 * Cache for function jwks sources, keyed by a caller-provided stable object.
 * Entries are released with their key, so per-request keys cannot accumulate.
 */
const functionJwksCache = new WeakMap<object, JwksCacheEntry>();

/**
 * How long a cached JWKS is trusted before it is refetched
 *
 * @internal
 */
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Returns the cached key set when it is within the TTL and contains `kid`.
 * Anything else (no entry, expired, or a kid absent from the set, e.g. a
 * newly rotated-in key) requires a refetch.
 */
function getFreshJwksWithKid(
	cached: JwksCacheEntry | undefined,
	kid: string,
): JSONWebKeySet | undefined {
	if (!cached) return undefined;
	if (Date.now() - cached.fetchedAt >= JWKS_CACHE_TTL_MS) return undefined;
	if (!cached.jwks.keys.some((jwk) => jwk.kid === kid)) return undefined;
	return cached.jwks;
}

export interface VerifyAccessTokenRemote {
	/** Full url of the introspect endpoint. Should end with `/oauth2/introspect` */
	introspectUrl: string;
	/** Client Secret */
	clientId: string;
	/** Client Secret */
	clientSecret: string;
	/**
	 * Forces remote verification of a token.
	 * This ensures attached session (if applicable)
	 * is also still active.
	 */
	force?: boolean;
	/**
	 * Accept introspection responses that omit the `aud` claim even when a
	 * required `audience` is configured in `verifyOptions`.
	 *
	 * By default verification fails closed: if you configure an `audience` and
	 * the introspection response has no `aud` (or a mismatching one), the token
	 * is rejected. Some authorization servers legitimately omit `aud` from
	 * introspection responses (it is OPTIONAL per RFC 7662 §2.2); only enable
	 * this if you trust the issuer to bind the token to this resource through
	 * another mechanism, as it skips the audience check in that case.
	 *
	 * @default false
	 */
	allowMissingAudience?: boolean;
}

/**
 * Performs local verification of an access token for your APIs.
 *
 * Can also be configured for remote verification.
 */
export async function verifyJwsAccessToken(
	token: string,
	opts: {
		/** Jwks url or promise of a Jwks */
		jwksFetch: string | (() => Promise<JSONWebKeySet | undefined>);
		/**
		 * Stable object to cache the result of a function `jwksFetch` under,
		 * with the same TTL and kid-miss refetch rules as string sources.
		 * Without it, a function source is fetched on every verification.
		 */
		jwksCacheKey?: object;
		/** Verify options */
		verifyOptions: JWTVerifyOptions &
			Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
	},
) {
	try {
		const jwks = await getJwks(token, opts);
		const jwt = await jwtVerify<JWTPayload>(
			token,
			createLocalJWKSet(jwks),
			opts.verifyOptions,
		);
		// Return the JWT payload in introspection format
		// https://datatracker.ietf.org/doc/html/rfc7662#section-2.2
		if (jwt.payload.azp) {
			jwt.payload.client_id = jwt.payload.azp;
		}
		return jwt.payload;
	} catch (error) {
		if (error instanceof Error) throw error;
		throw new Error(error as unknown as string);
	}
}

export async function getJwks(
	token: string,
	opts: {
		/** Jwks url or promise of a Jwks */
		jwksFetch: string | (() => Promise<JSONWebKeySet | undefined>);
		/**
		 * Stable object to cache the result of a function `jwksFetch` under,
		 * with the same TTL and kid-miss refetch rules as string sources.
		 * Without it, a function source is fetched on every verification.
		 */
		jwksCacheKey?: object;
	},
) {
	// Attempt to decode the token and find a matching kid in jwks
	let jwtHeaders: ProtectedHeaderParameters | undefined;
	try {
		jwtHeaders = decodeProtectedHeader(token);
	} catch (error) {
		if (error instanceof Error) throw error;
		throw new Error(error as unknown as string);
	}

	if (!jwtHeaders.kid) {
		throw new APIError("UNAUTHORIZED", { message: "invalid access token" });
	}
	const kid = jwtHeaders.kid;

	// Function sources have no usable identity of their own (callers pass
	// fresh closures per request), so they are cached only under a stable
	// caller-provided key object.
	if (typeof opts.jwksFetch !== "string") {
		const cacheKey = opts.jwksCacheKey;
		if (!cacheKey) {
			const jwks = await opts.jwksFetch();
			if (!jwks) throw new Error("No jwks found");
			return jwks;
		}
		const cachedJwks = getFreshJwksWithKid(
			functionJwksCache.get(cacheKey),
			kid,
		);
		if (cachedJwks) return cachedJwks;
		const jwks = await opts.jwksFetch();
		if (!jwks) throw new Error("No jwks found");
		functionJwksCache.set(cacheKey, { jwks, fetchedAt: Date.now() });
		return jwks;
	}

	// The cache is scoped to `cacheKey`, so a token is only ever matched
	// against the key set published by its own source.
	const cacheKey = opts.jwksFetch;
	const cachedJwks = getFreshJwksWithKid(jwksCache.get(cacheKey), kid);
	if (!cachedJwks) {
		const jwks = await betterFetch<JSONWebKeySet>(opts.jwksFetch, {
			headers: {
				Accept: "application/json",
			},
		}).then(async (res) => {
			if (res.error)
				throw new Error(
					`Jwks failed: ${res.error.message ?? res.error.statusText}`,
				);
			return res.data;
		});
		if (!jwks) throw new Error("No jwks found");
		jwksCache.set(cacheKey, { jwks, fetchedAt: Date.now() });
		return jwks;
	}

	return cachedJwks;
}

/**
 * Performs local verification of an access token for your API.
 *
 * Can also be configured for remote verification.
 */
export async function verifyAccessToken(
	token: string,
	opts: {
		/** Verify options */
		verifyOptions: JWTVerifyOptions &
			Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
		/** Scopes to additionally verify. Token must include all but not exact. */
		scopes?: string[];
		/** Required to verify access token locally */
		jwksUrl?: string;
		/** If provided, can verify a token remotely */
		remoteVerify?: VerifyAccessTokenRemote;
	},
) {
	let payload: JWTPayload | undefined;
	// Locally verify
	if (opts.jwksUrl && !opts?.remoteVerify?.force) {
		try {
			payload = await verifyJwsAccessToken(token, {
				jwksFetch: opts.jwksUrl,
				verifyOptions: opts.verifyOptions,
			});
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === "TypeError" || error.name === "JWSInvalid") {
					// likely an opaque token (continue)
				} else if (error instanceof joseErrors.JWTExpired) {
					throw new APIError("UNAUTHORIZED", {
						message: "token expired",
					});
				} else if (error instanceof joseErrors.JOSEError) {
					if (isJoseInfrastructureError(error)) {
						throw error;
					}
					throw new APIError("UNAUTHORIZED", {
						message: "invalid access token",
					});
				} else {
					throw error;
				}
			} else {
				throw new Error(error as unknown as string);
			}
		}
	}

	// Remote verify
	if (opts?.remoteVerify) {
		const { data: introspect, error: introspectError } = await betterFetch<
			JWTPayload & {
				active: boolean;
			}
		>(opts.remoteVerify.introspectUrl, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: opts.remoteVerify.clientId,
				client_secret: opts.remoteVerify.clientSecret,
				token,
				token_type_hint: "access_token",
			}).toString(),
		});
		if (introspectError)
			logger.error(
				`Introspection failed: ${introspectError.message ?? introspectError.statusText}`,
			);
		if (!introspect)
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: "introspection failed",
			});
		if (!introspect.active)
			throw new APIError("UNAUTHORIZED", {
				message: "token inactive",
			});
		// Verifies payload using verify options (token valid through introspect).
		// Audience is enforced by default: when `verifyOptions.audience` is set
		// but the introspection response omits `aud` (or it mismatches),
		// `UnsecuredJWT.decode` throws and the token is rejected. Otherwise a
		// token issued for a different resource/client on the same issuer would
		// also pass. Only drop the audience check when the caller has explicitly
		// opted in via `remoteVerify.allowMissingAudience`.
		try {
			const unsecuredJwt = new UnsecuredJWT(introspect).encode();
			const { audience: _audience, ...verifyOptionsNoAudience } =
				opts.verifyOptions;
			const skipAudience =
				!introspect.aud && opts.remoteVerify.allowMissingAudience === true;
			const verify = UnsecuredJWT.decode(
				unsecuredJwt,
				skipAudience ? verifyOptionsNoAudience : opts.verifyOptions,
			);
			payload = verify.payload;
		} catch (error) {
			throw new Error(error as unknown as string);
		}
	}

	if (!payload)
		throw new APIError("UNAUTHORIZED", {
			message: `no token payload`,
		});

	// Check scopes if provided
	if (opts.scopes) {
		const validScopes = new Set(
			(payload.scope as string | undefined)?.split(" "),
		);
		for (const sc of opts.scopes) {
			if (!validScopes.has(sc)) {
				throw new APIError("FORBIDDEN", {
					message: `invalid scope ${sc}`,
				});
			}
		}
	}

	return payload;
}
