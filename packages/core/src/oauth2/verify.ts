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
import type { DpopReplayStore } from "./dpop";
import {
	createInMemoryDpopReplayStore,
	enforceDpopBinding,
	getDpopJktFromPayload,
	isDpopBindingError,
	parseAccessTokenAuthorization,
} from "./dpop";
import { fetchRefusingRedirects } from "./reject-redirects";

const joseInfrastructureErrorCodes = new Set([
	joseErrors.JWKSTimeout.code,
	joseErrors.JWKSInvalid.code,
	joseErrors.JWKSMultipleMatchingKeys.code,
]);

function isJoseInfrastructureError(error: joseErrors.JOSEError) {
	return joseInfrastructureErrorCodes.has(error.code);
}

interface JwksCacheEntry {
	/** Last fetched key set; absent until a fetch succeeds. */
	jwks?: JSONWebKeySet | undefined;
	/** Start time of the fetch that produced `jwks`. */
	fetchedAt: number;
	/**
	 * Start time of the last refetch for a key missing from `jwks`, whatever
	 * its outcome.
	 */
	refetchedAt: number;
	pending?: { promise: Promise<JSONWebKeySet>; startedAt: number } | undefined;
}

type JwksFetchOptions = {
	/** Jwks url or promise of a Jwks */
	jwksFetch: string | (() => Promise<JSONWebKeySet | undefined>);
	/**
	 * Stable object to cache the result of a function `jwksFetch` under,
	 * with the same TTL and kid-miss refetch rules as string sources.
	 * Without it, a function source is fetched on every verification.
	 */
	jwksCacheKey?: object;
};

type ResolvedJwks = {
	jwks: JSONWebKeySet;
	kid: string | undefined;
	/**
	 * Refetches after `failed`, a set from this resolution that turned out to
	 * lack the token's key, or resolves `undefined` inside the refetch cooldown.
	 * Absent when `jwks` was just fetched.
	 */
	refresh?:
		| ((failed: JSONWebKeySet) => Promise<JSONWebKeySet | undefined>)
		| undefined;
};

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
// Minimum spacing between refetches of a fresh key set that lacks a token's
// key. Bounds how often tokens naming made-up `kid` values make a source fetch.
const JWKS_REFETCH_COOLDOWN_MS = 30 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5_000;

function getJwksCacheEntry<K>(
	cache: {
		get(key: K): JwksCacheEntry | undefined;
		set(key: K, entry: JwksCacheEntry): unknown;
	},
	key: K,
): JwksCacheEntry {
	let entry = cache.get(key);
	if (!entry) {
		entry = { fetchedAt: 0, refetchedAt: 0 };
		cache.set(key, entry);
	}
	return entry;
}

// A fetch older than its own timeout is dead: Cloudflare Workers cancels a
// request's I/O when that request ends, so its promise may never settle.
function isFetching(entry: JwksCacheEntry, now: number): boolean {
	return (
		entry.pending !== undefined &&
		now - entry.pending.startedAt < JWKS_FETCH_TIMEOUT_MS
	);
}

/**
 * Fetches the key set into `entry`, joining a fetch already in flight so
 * concurrent verifications share one call. Each caller bounds its own wait,
 * since the request that started the fetch may end before it settles.
 */
async function loadJwks(
	entry: JwksCacheEntry,
	jwksFetch: JwksFetchOptions["jwksFetch"],
): Promise<JSONWebKeySet> {
	const now = Date.now();
	if (!entry.pending || !isFetching(entry, now)) {
		const pending: NonNullable<JwksCacheEntry["pending"]> = {
			startedAt: now,
			promise: fetchJwks(jwksFetch)
				.then((jwks) => {
					if (now >= entry.fetchedAt) {
						entry.jwks = jwks;
						entry.fetchedAt = now;
					}
					return jwks;
				})
				.finally(() => {
					if (entry.pending === pending) entry.pending = undefined;
				}),
		};
		entry.pending = pending;
	}
	const { promise, startedAt } = entry.pending;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new joseErrors.JWKSTimeout()),
					startedAt + JWKS_FETCH_TIMEOUT_MS - now,
				);
			}),
		]);
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Refetches a fresh cached set, `current`, that lacks a token's key, such as a
 * newly rotated-in `kid`. Uses a set another request fetched after `current`
 * was read, or joins a fetch in flight. Otherwise refetches unless another
 * refetch started within the cooldown, and resolves `undefined` then. A refetch
 * consumes the cooldown whether or not it succeeds.
 */
async function refreshJwks(
	entry: JwksCacheEntry,
	current: JSONWebKeySet,
	jwksFetch: JwksFetchOptions["jwksFetch"],
): Promise<JSONWebKeySet | undefined> {
	if (entry.jwks !== current) return entry.jwks;
	const now = Date.now();
	if (!isFetching(entry, now)) {
		if (now - entry.refetchedAt < JWKS_REFETCH_COOLDOWN_MS) return undefined;
		entry.refetchedAt = now;
	}
	return loadJwks(entry, jwksFetch);
}

function shouldRefetchCachedJwksWithoutKid(
	error: unknown,
	resolved: ResolvedJwks,
) {
	return (
		!resolved.kid &&
		(error instanceof joseErrors.JWKSNoMatchingKey ||
			error instanceof joseErrors.JWSSignatureVerificationFailed)
	);
}

async function fetchJwks(
	jwksFetch: JwksFetchOptions["jwksFetch"],
): Promise<JSONWebKeySet> {
	try {
		const jwks =
			typeof jwksFetch === "string"
				? await fetchRefusingRedirects<JSONWebKeySet>(jwksFetch, {
						headers: {
							Accept: "application/json",
						},
					}).then(async (res) => {
						if (res.error)
							throw new Error(
								`Jwks failed: ${res.error.message ?? res.error.statusText}`,
							);
						return res.data;
					})
				: await jwksFetch();
		if (!jwks) throw new Error("No jwks found");
		return jwks;
	} catch (error) {
		if (error instanceof TypeError) {
			// A TypeError from a JWKS source is an infrastructure failure, not an
			// opaque token. Do not expose runtime-specific details to callers.
			try {
				logger.error("JWKS fetch failed:", error);
			} catch {
				// A throwing custom logger must not turn this back into a TypeError.
			}
			throw new Error("JWKS fetch failed");
		}
		throw error;
	}
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

export interface VerifyAccessTokenOptions {
	/** Verify options */
	verifyOptions: JWTVerifyOptions &
		Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
	/** Scopes the token must satisfy. */
	requiredScopes?: readonly string[];
	/**
	 * Determines whether a required scope is satisfied by the granted scope
	 * set. Defaults to exact set membership.
	 */
	isScopeSatisfied?: (
		requiredScope: string,
		grantedScopes: ReadonlySet<string>,
	) => boolean;
	/** Required to verify access token locally */
	jwksUrl?: string;
	/** If provided, can verify a token remotely */
	remoteVerify?: VerifyAccessTokenRemote;
}

export interface VerifyAccessTokenRequestOptions
	extends VerifyAccessTokenOptions {
	dpop?: {
		proofMaxAgeSeconds?: number;
		/**
		 * Store used to reject replayed DPoP proof `jti` values.
		 *
		 * Defaults to a process-local in-memory store, which is only safe for a
		 * single-instance deployment: it shares no state across instances and
		 * resets on cold start, so a captured proof can be replayed against
		 * another instance within the proof's lifetime. Supply a shared,
		 * persistent store (for example one backed by your database) for any
		 * multi-instance or serverless resource server.
		 */
		replayStore?: DpopReplayStore;
		signingAlgorithms?: readonly string[];
	};
}

export interface ResourceRequestInput {
	authorizationHeader: string | null | undefined;
	dpopProofJwt?: string | null | undefined;
	method: string;
	url: string;
}

/**
 * Builds a {@link ResourceRequestInput} from a standard `Request`, reading the
 * `Authorization` and `DPoP` headers and the request method and URL. Resource
 * servers share this so every entry point maps the wire request the same way.
 */
export function requestToResourceInput(request: Request): ResourceRequestInput {
	return {
		authorizationHeader: request.headers.get("authorization"),
		dpopProofJwt: request.headers.get("dpop"),
		method: request.method,
		url: request.url,
	};
}

/**
 * Process-local, single-instance replay store. See the warning on
 * {@link VerifyAccessTokenRequestOptions.dpop.replayStore}; multi-instance
 * resource servers must pass their own shared store.
 */
const defaultDpopReplayStore = createInMemoryDpopReplayStore();

/**
 * @internal
 */
export async function verifyJwsToken<PayloadType = JWTPayload>(
	token: string,
	opts: JwksFetchOptions & {
		verifyOptions: JWTVerifyOptions;
	},
) {
	if (token.split(".").length !== 3) {
		throw new joseErrors.JWSInvalid("Invalid Compact JWS");
	}
	const resolved = await getJwksForVerification(token, opts);
	let jwks = resolved.jwks;
	// Retry with a newer cached key set, then await a fetch already in progress.
	// Allow at most two retries.
	for (let refreshes = 0; ; refreshes++) {
		try {
			return await jwtVerify<PayloadType>(
				token,
				createLocalJWKSet(jwks),
				opts.verifyOptions,
			);
		} catch (error) {
			const refreshed =
				refreshes < 2 && shouldRefetchCachedJwksWithoutKid(error, resolved)
					? await resolved.refresh?.(jwks)
					: undefined;
			if (!refreshed) throw error;
			jwks = refreshed;
		}
	}
}

/**
 * Performs local verification of an access token for your APIs.
 *
 * Can also be configured for remote verification.
 */
export async function verifyJwsAccessToken(
	token: string,
	opts: JwksFetchOptions & {
		/** Verify options */
		verifyOptions: JWTVerifyOptions &
			Required<Pick<JWTVerifyOptions, "audience" | "issuer">>;
	},
) {
	try {
		const jwt = await verifyJwsToken(token, opts);
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

export async function getJwks(token: string, opts: JwksFetchOptions) {
	return (await getJwksForVerification(token, opts)).jwks;
}

async function getJwksForVerification(
	token: string,
	opts: JwksFetchOptions,
): Promise<ResolvedJwks> {
	// Attempt to decode the token and find a matching kid in jwks
	let jwtHeaders: ProtectedHeaderParameters | undefined;
	try {
		jwtHeaders = decodeProtectedHeader(token);
	} catch (error) {
		if (error instanceof Error) throw error;
		throw new Error(error as unknown as string);
	}

	const kid = jwtHeaders.kid;

	// The cache is scoped to the source, so a token is only ever matched against
	// the key set published by its own source. Function sources have no usable
	// identity of their own (callers pass fresh closures per request), so they
	// are cached only under a stable caller-provided key object; without one,
	// a throwaway entry still bounds the fetch.
	const entry =
		typeof opts.jwksFetch === "string"
			? getJwksCacheEntry(jwksCache, opts.jwksFetch)
			: opts.jwksCacheKey
				? getJwksCacheEntry(functionJwksCache, opts.jwksCacheKey)
				: { fetchedAt: 0, refetchedAt: 0 };

	const cached =
		Date.now() - entry.fetchedAt < JWKS_CACHE_TTL_MS ? entry.jwks : undefined;
	if (!cached) {
		return { jwks: await loadJwks(entry, opts.jwksFetch), kid };
	}
	const refresh = (failed: JSONWebKeySet) =>
		refreshJwks(entry, failed, opts.jwksFetch);
	// Without `kid`, key selection is deferred to JOSE because RFC 7515 makes
	// the header parameter optional.
	if (!kid || cached.keys.some((jwk) => jwk.kid === kid)) {
		return { jwks: cached, kid, refresh };
	}
	return { jwks: (await refresh(cached)) ?? cached, kid };
}

async function verifyAccessTokenPayload(
	token: string,
	opts: VerifyAccessTokenOptions,
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
		const { data: introspect, error: introspectError } =
			await fetchRefusingRedirects<
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

	const grantedScopes = parseGrantedScopes(payload.scope);

	// Check scopes if provided.
	if (opts.requiredScopes) {
		const isScopeSatisfied =
			opts.isScopeSatisfied ??
			((requiredScope: string, scopes: ReadonlySet<string>) =>
				scopes.has(requiredScope));
		// RFC 6750 §3.1: report every missing scope at once. Challenging with one
		// scope at a time costs the user a browser round-trip per scope.
		const missingScopes = opts.requiredScopes.filter(
			(scope) => !isScopeSatisfied(scope, grantedScopes),
		);
		if (missingScopes.length > 0) {
			throw createInsufficientScopeError(missingScopes);
		}
	}

	return payload;
}

/**
 * Build the RFC 6750 §3.1 insufficient-scope failure: the access token is valid
 * but lacks scopes the operation needs.
 *
 * Resource-server challenge builders turn this into a `403` carrying a
 * `WWW-Authenticate: Bearer error="insufficient_scope"` challenge that names
 * `scopes`, so the client knows what to request when it re-authorizes. Throw it
 * from a route handler to challenge for scopes only that operation needs; a
 * plain `FORBIDDEN` stays a plain `403`, since a permission denial the client
 * cannot fix by re-authorizing must not send the user through consent again.
 *
 * @param requiredScopes - Every scope the operation requires but the token lacks.
 * @param description - RFC 6750 `error_description` text. It must use the
 * printable ASCII character set allowed by the specification.
 */
const OAUTH_SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]+$/;
const OAUTH_ERROR_DESCRIPTION_PATTERN = /^[\x20-\x21\x23-\x5b\x5d-\x7e]+$/;
const insufficientScopeErrors = new WeakSet<APIError>();

function isOAuthScopeToken(value: string): boolean {
	return OAUTH_SCOPE_TOKEN_PATTERN.test(value);
}

function validateScopeTokens(scopes: readonly string[], label: string): void {
	for (const scope of scopes) {
		if (!isOAuthScopeToken(scope)) {
			throw new TypeError(`invalid ${label}: ${JSON.stringify(scope)}`);
		}
	}
}

function validateRequiredScopes(opts: VerifyAccessTokenOptions): void {
	if (opts.requiredScopes) {
		validateScopeTokens(opts.requiredScopes, "required scope");
	}
}

function parseGrantedScopes(scope: unknown): ReadonlySet<string> {
	if (scope === undefined) return new Set();
	if (
		typeof scope !== "string" ||
		scope.length === 0 ||
		scope.split(" ").some((token) => !isOAuthScopeToken(token))
	) {
		throw new APIError("UNAUTHORIZED", {
			message: "access token scope claim is invalid",
			error: "invalid_token",
			error_description: "access token scope claim is invalid",
		});
	}
	return new Set(scope.split(" "));
}

export function createInsufficientScopeError(
	requiredScopes: readonly string[],
	description = `access token is missing required scope: ${requiredScopes.join(" ")}`,
): APIError {
	if (requiredScopes.length === 0) {
		throw new TypeError("requiredScopes must contain at least one scope");
	}
	validateScopeTokens(requiredScopes, "required scope");
	if (
		typeof description !== "string" ||
		!OAUTH_ERROR_DESCRIPTION_PATTERN.test(description)
	) {
		throw new TypeError("invalid error_description");
	}
	const error = new APIError("FORBIDDEN", {
		message: description,
		error: "insufficient_scope",
		error_description: description,
		scope: [...new Set(requiredScopes)].join(" "),
	});
	insufficientScopeErrors.add(error);
	return error;
}

/**
 * Returns whether an error is a typed RFC 6750 insufficient-scope failure.
 */
export function isInsufficientScopeError(error: unknown): error is APIError {
	if (
		!(error instanceof APIError) ||
		!insufficientScopeErrors.has(error) ||
		error.status !== "FORBIDDEN"
	)
		return false;
	const body = error.body as { error?: unknown; scope?: unknown } | undefined;
	if (body?.error !== "insufficient_scope" || typeof body.scope !== "string") {
		return false;
	}
	const scopes = body.scope.split(" ");
	return scopes.length > 0 && scopes.every(isOAuthScopeToken);
}

function throwDpopUnauthorized(
	message: string,
	error?: "invalid_dpop_proof" | "invalid_token",
): never {
	throw new APIError(
		"UNAUTHORIZED",
		error
			? {
					message,
					error,
					error_description: message,
				}
			: { message },
	);
}

/**
 * Performs local verification of a bearer access token for your API.
 *
 * Can also be configured for remote verification. DPoP-bound access tokens
 * require {@link verifyAccessTokenRequest}, because sender-constraining cannot
 * be verified without the HTTP method, URL, Authorization scheme, DPoP proof,
 * and access-token hash. This function rejects DPoP-bound tokens; reach for it
 * only when you hold a raw token string and intentionally accept bearer tokens
 * alone.
 */
export async function verifyBearerToken(
	token: string,
	opts: VerifyAccessTokenOptions,
) {
	validateRequiredScopes(opts);
	const payload = await verifyAccessTokenPayload(token, opts);
	if (getDpopJktFromPayload(payload)) {
		throwDpopUnauthorized(
			"DPoP-bound access token requires verifyAccessTokenRequest",
			"invalid_token",
		);
	}
	return payload;
}

/**
 * Verifies an HTTP resource request carrying an OAuth access token. This is the
 * recommended resource-server entry point: it handles both bearer and
 * DPoP-bound tokens, the bearer case being the request with no DPoP proof.
 *
 * It performs the same token validation as {@link verifyBearerToken}, then adds
 * the RFC 9449 sender-constraint checks that need request context: authorization
 * scheme, method, URL, DPoP proof, `ath`, and `cnf.jkt` binding.
 */
export async function verifyAccessTokenRequest(
	request: ResourceRequestInput,
	opts: VerifyAccessTokenRequestOptions,
) {
	validateRequiredScopes(opts);
	const authorization = parseAccessTokenAuthorization(
		request.authorizationHeader,
	);
	if (!authorization?.token) {
		throwDpopUnauthorized("missing authorization header");
	}
	// RFC 6750 §2.1 / RFC 9449 §7.1: an access token is presented with the
	// `Bearer` or `DPoP` scheme. Reject a scheme-less or unknown-scheme value
	// rather than accept a bare token.
	if (authorization.scheme === "Unknown") {
		throwDpopUnauthorized(
			"authorization scheme must be Bearer or DPoP",
			"invalid_token",
		);
	}

	const payload = await verifyAccessTokenPayload(authorization.token, opts);

	try {
		await enforceDpopBinding({
			payload,
			authorization,
			proofJwt: request.dpopProofJwt,
			method: request.method,
			url: request.url,
			replayStore: opts.dpop?.replayStore ?? defaultDpopReplayStore,
			proofMaxAgeSeconds: opts.dpop?.proofMaxAgeSeconds,
			signingAlgorithms: opts.dpop?.signingAlgorithms,
		});
	} catch (error) {
		if (isDpopBindingError(error)) {
			throwDpopUnauthorized(error.message, error.code);
		}
		throw error;
	}

	return payload;
}
