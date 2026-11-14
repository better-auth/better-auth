import { isAPIError, NO_STORE_HEADERS } from "better-auth/api";
import type { ResourceRequestInput } from "better-auth/oauth2";
import {
	DPOP_NONCE_HEADER,
	DPOP_SIGNING_ALGORITHMS,
	isInsufficientScopeError,
	parseAccessTokenAuthorization,
} from "better-auth/oauth2";
import { APIError } from "better-call";
import { withExposedHeaders } from "./dpop";

const DPOP_CHALLENGE_ERRORS = new Set(["invalid_dpop_proof", "use_dpop_nonce"]);
const OAUTH_SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]+$/;
const ERROR_DESCRIPTION_EXCLUDED = /[^\x20-\x21\x23-\x5b\x5d-\x7e]+/g;

function quoteAuthParam(value: string): string {
	if (/[\x00-\x1f\x7f]/.test(value)) {
		throw new TypeError("invalid WWW-Authenticate parameter");
	}
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function serializeChallengeScopes(scopes: readonly string[] | undefined) {
	if (!scopes) return undefined;
	for (const scope of scopes) {
		if (!OAUTH_SCOPE_TOKEN_PATTERN.test(scope)) {
			throw new TypeError(`invalid challenge scope: ${JSON.stringify(scope)}`);
		}
	}
	return [...new Set(scopes)].join(" ");
}

/**
 * Fits a runtime error message into RFC 6750 §3's `error_description`
 * character set instead of failing the response it describes: `"` becomes
 * `'`, any other excluded character (`\`, controls, non-ASCII) becomes a space,
 * and a description with nothing left is omitted.
 */
function formatErrorDescription(description: unknown): string | undefined {
	if (typeof description !== "string") return undefined;
	const formatted = description
		.replace(/"/g, "'")
		.replace(ERROR_DESCRIPTION_EXCLUDED, " ")
		.replace(/ {2,}/g, " ")
		.trim();
	return formatted || undefined;
}

function extractTokenError(error: APIError): {
	errorCode?: string;
	description: string;
} {
	const body = error.body as
		| { error?: unknown; error_description?: unknown; message?: unknown }
		| undefined;
	const errorCode = typeof body?.error === "string" ? body.error : undefined;
	const description =
		typeof body?.error_description === "string"
			? body.error_description
			: typeof body?.message === "string"
				? body.message
				: error.message;
	return { errorCode, description };
}

function presentedScheme(
	request:
		| Request
		| Pick<ResourceRequestInput, "authorizationHeader">
		| undefined,
) {
	if (!request) return undefined;
	// Duck-type the `Request` so a cross-realm instance is still recognized.
	const authorizationHeader =
		typeof (request as Request).headers?.get === "function"
			? (request as Request).headers.get("authorization")
			: (request as Pick<ResourceRequestInput, "authorizationHeader">)
					.authorizationHeader;
	return parseAccessTokenAuthorization(authorizationHeader)?.scheme;
}

/**
 * RFC 9449 §7.2: a request that presented its token with the `DPoP` scheme
 * gets a `DPoP` challenge. Without the scheme, only a DPoP-specific error,
 * such as a DPoP-bound token sent with `Bearer`, gets one.
 */
function usesDpopChallenge(
	error: APIError,
	request:
		| Request
		| Pick<ResourceRequestInput, "authorizationHeader">
		| undefined,
) {
	const scheme = presentedScheme(request);
	if (scheme === "DPoP") return true;
	if (request && scheme !== "Bearer") return false;
	const { errorCode, description } = extractTokenError(error);
	return (
		!!errorCode &&
		(DPOP_CHALLENGE_ERRORS.has(errorCode) ||
			(errorCode === "invalid_token" && description.includes("DPoP")))
	);
}

/**
 * RFC 9449 §7.1: a `DPoP` challenge for a request that presented a token,
 * with the proof algorithms the resource accepts.
 */
function dpopChallengeParams(params: {
	errorCode: string;
	description: unknown;
	algorithms: readonly string[] | undefined;
	scope?: string;
}) {
	const errorDescription = formatErrorDescription(params.description);
	return (metadataUrl: string | undefined) => [
		`error="${quoteAuthParam(params.errorCode)}"`,
		params.scope && `scope="${quoteAuthParam(params.scope)}"`,
		errorDescription && `error_description="${errorDescription}"`,
		resourceMetadataParam(metadataUrl),
		algsParam(params.algorithms),
	];
}

/** RFC 9728 §5.1, for `Bearer` and `DPoP` challenges alike. */
function resourceMetadataParam(metadataUrl: string | undefined) {
	return metadataUrl && `resource_metadata="${quoteAuthParam(metadataUrl)}"`;
}

function algsParam(algorithms: readonly string[] = DPOP_SIGNING_ALGORITHMS) {
	return `algs="${quoteAuthParam(algorithms.join(" "))}"`;
}

/**
 * `WWW-Authenticate` is not a CORS-safelisted response header, so browsers
 * hide it from cross-origin clients unless the response exposes it.
 */
function challengeHeaders(challenge: string): Record<string, string> {
	return {
		"WWW-Authenticate": challenge,
		"Access-Control-Expose-Headers": "WWW-Authenticate",
	};
}

function buildDpopChallengeHeaders(
	error: APIError,
	challenge: string,
): Record<string, string> {
	const headers = challengeHeaders(challenge);
	// RFC 9449 §9: a `use_dpop_nonce` challenge carries the nonce to retry with
	// in its own `DPoP-Nonce` header. The response must not be cached (§8.2),
	// and a browser client can act on it only when it can read both headers.
	const errorHeaders = new Headers(error.headers);
	const nonce = errorHeaders.get(DPOP_NONCE_HEADER);
	if (nonce) {
		Object.assign(headers, NO_STORE_HEADERS);
		headers[DPOP_NONCE_HEADER] = nonce;
		headers["Access-Control-Expose-Headers"] = withExposedHeaders(
			errorHeaders.get("access-control-expose-headers"),
			DPOP_NONCE_HEADER,
			"WWW-Authenticate",
		);
	}
	return headers;
}

function challengeBody(
	message: string,
	errorCode: string | undefined,
	description: unknown,
) {
	if (!errorCode) return { message };
	return {
		message,
		error: errorCode,
		...(typeof description === "string" && { error_description: description }),
	};
}

function extractInsufficientScope(error: APIError): {
	scope: string;
	description: unknown;
} {
	const body = error.body as
		| { error?: unknown; error_description?: unknown; scope?: unknown }
		| undefined;
	return {
		scope: body?.scope as string,
		description:
			body?.error_description !== undefined
				? body.error_description
				: error.message,
	};
}

function resolveResourceMetadataUrl(
	value: string,
	opts?: { resourceMetadataMappings?: Record<string, string> },
): string {
	// Opaque absolute URIs (for example `urn:`) parse with an `origin` of
	// "null", so only origin-based URLs derive the well-known metadata URL;
	// everything else needs an explicit mapping.
	const url = URL.canParse?.(value) ? new URL(value) : null;
	if (url && url.origin !== "null") {
		const resourcePath = url.pathname.endsWith("/")
			? url.pathname.slice(0, -1)
			: url.pathname;
		return `${url.origin}/.well-known/oauth-protected-resource${resourcePath}${url.search}`;
	}
	const resourceMetadata = opts?.resourceMetadataMappings?.[value];
	if (!resourceMetadata) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: `missing resource_metadata mapping for ${value}`,
		});
	}
	return resourceMetadata;
}

/**
 * One challenge per protected resource, each with that resource's RFC 9728
 * §5.1 `resource_metadata`, which applies to the `Bearer` and `DPoP` schemes
 * alike.
 */
function buildChallenge(
	scheme: "Bearer" | "DPoP",
	resource: string | string[] | undefined,
	opts: { resourceMetadataMappings?: Record<string, string> } | undefined,
	authParams: (
		metadataUrl: string | undefined,
	) => (string | false | undefined)[],
): string {
	const metadataUrls =
		resource === undefined
			? [undefined]
			: (Array.isArray(resource) ? resource : [resource]).map((value) =>
					resolveResourceMetadataUrl(value, opts),
				);
	return metadataUrls
		.map((metadataUrl) => {
			const params = authParams(metadataUrl).filter((param) => !!param);
			return params.length ? `${scheme} ${params.join(", ")}` : scheme;
		})
		.join(", ");
}

/**
 * Create an OAuth resource-server challenge for a failed access-token request.
 *
 * Every challenge carries the RFC 9728 §5.1 `resource_metadata` pointer, and
 * DPoP challenges also carry `algs`.
 *
 * Missing/invalid bearer credentials are reported with RFC 6750 plus the RFC
 * 9728 `resource_metadata` pointer. A 401 whose body has
 * `error: "invalid_token"` means a presented token failed, so its challenge
 * also carries that code and an `error_description` (RFC 6750 §3.1); any
 * other 401 is treated as a request without credentials and carries neither.
 * Insufficient-scope failures (built with
 * `createInsufficientScopeError`) are reported with RFC 6750 §3.1's
 * `insufficient_scope` challenge on a 403 naming the scopes the token lacks, so
 * clients can step up their authorization. DPoP-bound-token failures are
 * reported with RFC 9449's `DPoP` challenge so clients know which proof
 * algorithms to use. Pass the failed `request` so that any 401 or
 * insufficient-scope 403 on a request that presented its token with the
 * `DPoP` scheme, such as an expired or revoked token, is also answered with a
 * `DPoP` challenge (RFC 9449 §7.2), and a 401 on one with an unsupported
 * scheme, or none, with a `Bearer` challenge (RFC 6750 §3.1). Without it,
 * only DPoP-specific errors get one. A `use_dpop_nonce` failure keeps its
 * `DPoP-Nonce` header so the client can retry with the nonce (RFC 9449 §9),
 * adds `Cache-Control: no-store`, and adds `DPoP-Nonce` and `WWW-Authenticate`
 * to the error's `Access-Control-Expose-Headers`. Every challenge exposes
 * `WWW-Authenticate` to cross-origin clients. Non-URL resources (for example a
 * `urn:` or a client id) resolve their metadata URL through
 * `resourceMetadataMappings`.
 *
 * An `error_description` is fitted into RFC 6750 §3's character set rather
 * than rejected: `"` becomes `'`, other excluded characters become spaces, and
 * an empty result is omitted. The returned error's body keeps the original
 * `error` and `error_description`. Invalid scope tokens in `challengeScopes`
 * still throw, since they are server configuration.
 *
 * Every other error returns `undefined`, including a plain `FORBIDDEN`: a
 * permission denial that re-authorizing cannot fix must not be answered with a
 * challenge that sends the user through consent for scopes they already hold.
 *
 * @external
 */
export function createResourceServerChallenge(
	error: unknown,
	resource: string | string[],
	opts?: {
		/** Maps non-URL (urn, client) resources to their resource_metadata URL. */
		resourceMetadataMappings?: Record<string, string>;
		/** DPoP JWS algorithms to advertise in RFC 9449 challenges. */
		dpopSigningAlgorithms?: readonly string[];
		/**
		 * Scopes to advertise in RFC 6750 bearer challenges,
		 * hinting what an unauthenticated client should request. An
		 * insufficient-scope failure advertises the scopes it names instead.
		 */
		challengeScopes?: readonly string[];
		/**
		 * The request that failed, or its `Authorization` header as
		 * `{ authorizationHeader }`. A 401 or insufficient-scope 403 on a
		 * request that used the `DPoP` scheme is answered with a `DPoP`
		 * challenge rather than `Bearer`, and a 401 with an unsupported scheme,
		 * or none, always with `Bearer`.
		 */
		request?: Request | Pick<ResourceRequestInput, "authorizationHeader">;
	},
): APIError | undefined {
	return buildResourceServerChallenge(error, resource, opts);
}

/**
 * The challenge for a request without usable credentials. RFC 6750 §3.1 gives
 * it no error code, and it offers both schemes (RFC 9449 §7.1) so the client
 * can pick the one it holds a token for.
 */
export function buildMissingCredentialsChallenge(
	resource: string | string[] | undefined,
	opts?: {
		resourceMetadataMappings?: Record<string, string>;
		dpopSigningAlgorithms?: readonly string[];
	},
	scope?: string,
): string {
	const scopeParam = scope && `scope="${quoteAuthParam(scope)}"`;
	const bearer = buildChallenge("Bearer", resource, opts, (metadataUrl) => [
		resourceMetadataParam(metadataUrl),
		scopeParam,
	]);
	const dpop = buildChallenge("DPoP", resource, opts, (metadataUrl) => [
		scopeParam,
		resourceMetadataParam(metadataUrl),
		algsParam(opts?.dpopSigningAlgorithms),
	]);
	return `${bearer}, ${dpop}`;
}

/**
 * {@link createResourceServerChallenge} for a resource that may have no
 * identifier, such as UserInfo. Without `resource`, a challenge omits
 * `resource_metadata`.
 */
export function buildResourceServerChallenge(
	error: unknown,
	resource: string | string[] | undefined,
	opts?: Parameters<typeof createResourceServerChallenge>[2],
): APIError | undefined {
	const challengeScope = serializeChallengeScopes(opts?.challengeScopes);
	if (isAPIError(error) && error.status === "UNAUTHORIZED") {
		const { errorCode, description } = extractTokenError(error);
		if (usesDpopChallenge(error, opts?.request)) {
			// Only the request's DPoP scheme can select this branch without an
			// error code, and that request presented a token.
			const dpopErrorCode = errorCode ?? "invalid_token";
			const challenge = buildChallenge(
				"DPoP",
				resource,
				opts,
				dpopChallengeParams({
					errorCode: dpopErrorCode,
					description,
					algorithms: opts?.dpopSigningAlgorithms,
				}),
			);
			return new APIError(
				"UNAUTHORIZED",
				challengeBody(error.message, dpopErrorCode, description),
				buildDpopChallengeHeaders(error, challenge),
			);
		}
		// RFC 6750 §3.1: only a request that presented a token which failed
		// carries an error code. One that sent no credentials gets none, and is
		// offered both schemes.
		if (errorCode !== "invalid_token") {
			return new APIError(
				"UNAUTHORIZED",
				challengeBody(error.message, undefined, description),
				challengeHeaders(
					buildMissingCredentialsChallenge(resource, opts, challengeScope),
				),
			);
		}
		const errorDescription = formatErrorDescription(description);
		return new APIError(
			"UNAUTHORIZED",
			challengeBody(error.message, errorCode, description),
			challengeHeaders(
				buildChallenge("Bearer", resource, opts, (metadataUrl) => [
					`error="invalid_token"`,
					errorDescription && `error_description="${errorDescription}"`,
					resourceMetadataParam(metadataUrl),
					challengeScope && `scope="${quoteAuthParam(challengeScope)}"`,
				]),
			),
		);
	}
	if (isInsufficientScopeError(error)) {
		const insufficientScope = extractInsufficientScope(error);
		const errorDescription = formatErrorDescription(
			insufficientScope.description,
		);
		// RFC 6750 §3.1: a token that is valid but lacks the scopes the
		// operation needs answers with 403 and an `insufficient_scope`
		// challenge naming them, so the client can step up via re-authorization.
		// `challengeScopes` is only a fallback: the scopes the token actually lacks
		// are the ones re-authorizing has to add.
		const scope = insufficientScope.scope || challengeScope;
		const message =
			typeof insufficientScope.description === "string"
				? insufficientScope.description
				: error.message;
		// RFC 9449 §7.1 allows `scope` in a `DPoP` challenge.
		const challenge = usesDpopChallenge(error, opts?.request)
			? buildChallenge(
					"DPoP",
					resource,
					opts,
					dpopChallengeParams({
						errorCode: "insufficient_scope",
						description: insufficientScope.description,
						algorithms: opts?.dpopSigningAlgorithms,
						scope,
					}),
				)
			: buildChallenge("Bearer", resource, opts, (metadataUrl) => [
					`error="insufficient_scope"`,
					scope && `scope="${quoteAuthParam(scope)}"`,
					resourceMetadataParam(metadataUrl),
					errorDescription && `error_description="${errorDescription}"`,
				]);
		return new APIError(
			"FORBIDDEN",
			challengeBody(
				message,
				"insufficient_scope",
				insufficientScope.description,
			),
			challengeHeaders(challenge),
		);
	}
	return undefined;
}
