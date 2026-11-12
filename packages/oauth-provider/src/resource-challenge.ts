import { isAPIError } from "better-auth/api";
import type { ResourceRequestInput } from "better-auth/oauth2";
import {
	DPOP_SIGNING_ALGORITHMS,
	isInsufficientScopeError,
	parseAccessTokenAuthorization,
} from "better-auth/oauth2";
import { APIError } from "better-call";

const DPOP_CHALLENGE_ERRORS = new Set(["invalid_dpop_proof"]);
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

function isDpopChallengeError(error: APIError) {
	const { errorCode, description } = extractTokenError(error);
	return (
		!!errorCode &&
		(DPOP_CHALLENGE_ERRORS.has(errorCode) ||
			(errorCode === "invalid_token" && description.includes("DPoP")))
	);
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

/** Builds an RFC 9449 §7.1 `WWW-Authenticate: DPoP` challenge value. */
export function buildDpopChallengeValue(
	errorCode: string,
	description: unknown,
	algorithms: readonly string[] = DPOP_SIGNING_ALGORITHMS,
) {
	const errorDescription = formatErrorDescription(description);
	return [
		`DPoP error="${quoteAuthParam(errorCode)}"`,
		errorDescription && `error_description="${errorDescription}"`,
		`algs="${quoteAuthParam(algorithms.join(" "))}"`,
	]
		.filter((param) => !!param)
		.join(", ");
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

function buildBearerChallenge(
	resource: string | string[],
	opts: { resourceMetadataMappings?: Record<string, string> } | undefined,
	authParams: (metadataUrl: string) => (string | false | undefined)[],
): string {
	const resources = Array.isArray(resource) ? resource : [resource];
	return resources
		.map((value) => {
			const params = authParams(resolveResourceMetadataUrl(value, opts)).filter(
				(param) => !!param,
			);
			return `Bearer ${params.join(", ")}`;
		})
		.join(", ");
}

/**
 * Create an OAuth resource-server challenge for a failed access-token request.
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
 * algorithms to use. Pass the failed `request` so that any 401 on a request
 * that presented its token with the `DPoP` scheme, such as an expired or
 * revoked token, is also answered with a `DPoP` challenge (RFC 9449 §7.2),
 * and one with an unsupported scheme, or none, with a `Bearer` challenge
 * (RFC 6750 §3.1). Without it, only DPoP-specific errors get one. Non-URL
 * resources (for example a `urn:` or a client id) resolve their metadata URL
 * through `resourceMetadataMappings`.
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
		 * `{ authorizationHeader }`. A 401 on a request that used the `DPoP`
		 * scheme is answered with a `DPoP` challenge rather than `Bearer`, and one
		 * with an unsupported scheme, or none, always with `Bearer`.
		 */
		request?: Request | Pick<ResourceRequestInput, "authorizationHeader">;
	},
): APIError | undefined {
	const challengeScope = serializeChallengeScopes(opts?.challengeScopes);
	if (isAPIError(error) && error.status === "UNAUTHORIZED") {
		const { errorCode, description } = extractTokenError(error);
		// `Unknown` is an unsupported scheme or none, which never attempted DPoP.
		const scheme = presentedScheme(opts?.request);
		if (
			scheme === "DPoP" ||
			(scheme !== "Unknown" && isDpopChallengeError(error))
		) {
			// Only the request's DPoP scheme can select this branch without an
			// error code, and that request presented a token.
			const dpopErrorCode = errorCode ?? "invalid_token";
			return new APIError(
				"UNAUTHORIZED",
				challengeBody(error.message, dpopErrorCode, description),
				{
					"WWW-Authenticate": buildDpopChallengeValue(
						dpopErrorCode,
						description,
						opts?.dpopSigningAlgorithms,
					),
				},
			);
		}
		// RFC 6750 §3.1: only a request that presented a token which failed
		// carries an error code; one that sent no credentials gets none.
		const invalidToken = errorCode === "invalid_token";
		const errorDescription = invalidToken
			? formatErrorDescription(description)
			: undefined;
		return new APIError(
			"UNAUTHORIZED",
			challengeBody(
				error.message,
				invalidToken ? errorCode : undefined,
				description,
			),
			{
				"WWW-Authenticate": buildBearerChallenge(
					resource,
					opts,
					(metadataUrl) => [
						invalidToken && `error="invalid_token"`,
						errorDescription && `error_description="${errorDescription}"`,
						`resource_metadata="${quoteAuthParam(metadataUrl)}"`,
						challengeScope && `scope="${quoteAuthParam(challengeScope)}"`,
					],
				),
			},
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
		return new APIError(
			"FORBIDDEN",
			challengeBody(
				message,
				"insufficient_scope",
				insufficientScope.description,
			),
			{
				"WWW-Authenticate": buildBearerChallenge(
					resource,
					opts,
					(metadataUrl) => [
						`error="insufficient_scope"`,
						scope && `scope="${quoteAuthParam(scope)}"`,
						`resource_metadata="${quoteAuthParam(metadataUrl)}"`,
						errorDescription && `error_description="${errorDescription}"`,
					],
				),
			},
		);
	}
	return undefined;
}
