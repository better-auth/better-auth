import { isAPIError } from "better-auth/api";
import {
	DPOP_SIGNING_ALGORITHMS,
	isInsufficientScopeError,
} from "better-auth/oauth2";
import { APIError } from "better-call";

const DPOP_CHALLENGE_ERRORS = new Set(["invalid_dpop_proof"]);
const OAUTH_SCOPE_TOKEN_PATTERN = /^[\x21\x23-\x5b\x5d-\x7e]+$/;
const ERROR_DESCRIPTION_PATTERN = /^[\x20-\x21\x23-\x5b\x5d-\x7e]+$/;

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

function validateErrorDescription(description: unknown): string {
	if (
		typeof description !== "string" ||
		!ERROR_DESCRIPTION_PATTERN.test(description)
	) {
		throw new TypeError("invalid error_description");
	}
	return description;
}

function extractDpopError(error: APIError): {
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
	const { errorCode, description } = extractDpopError(error);
	return (
		!!errorCode &&
		(DPOP_CHALLENGE_ERRORS.has(errorCode) ||
			(errorCode === "invalid_token" && description.includes("DPoP")))
	);
}

function buildDpopChallenge(
	error: APIError,
	opts?: {
		dpopSigningAlgorithms?: readonly string[];
	},
) {
	const { errorCode, description } = extractDpopError(error);
	const algorithms = opts?.dpopSigningAlgorithms ?? DPOP_SIGNING_ALGORITHMS;
	return [
		`DPoP error="${quoteAuthParam(errorCode ?? "invalid_dpop_proof")}"`,
		`error_description="${validateErrorDescription(description)}"`,
		`algs="${quoteAuthParam(algorithms.join(" "))}"`,
	].join(", ");
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
 * 9728 `resource_metadata` pointer. Insufficient-scope failures (built with
 * `createInsufficientScopeError`) are reported with RFC 6750 §3.1's
 * `insufficient_scope` challenge on a 403 naming the scopes the token lacks, so
 * clients can step up their authorization. DPoP-bound-token failures are
 * reported with RFC 9449's `DPoP` challenge so clients know which proof
 * algorithms to use. Non-URL resources (for example a `urn:` or a client id)
 * resolve their metadata URL through `resourceMetadataMappings`.
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
	},
): APIError | undefined {
	const challengeScope = serializeChallengeScopes(opts?.challengeScopes);
	if (isAPIError(error) && error.status === "UNAUTHORIZED") {
		if (isDpopChallengeError(error)) {
			return new APIError(
				"UNAUTHORIZED",
				{ message: error.message },
				{ "WWW-Authenticate": buildDpopChallenge(error, opts) },
			);
		}
		return new APIError(
			"UNAUTHORIZED",
			{ message: error.message },
			{
				"WWW-Authenticate": buildBearerChallenge(
					resource,
					opts,
					(metadataUrl) => [
						`resource_metadata="${quoteAuthParam(metadataUrl)}"`,
						challengeScope && `scope="${quoteAuthParam(challengeScope)}"`,
					],
				),
			},
		);
	}
	if (isInsufficientScopeError(error)) {
		const insufficientScope = extractInsufficientScope(error);
		const errorDescription = validateErrorDescription(
			insufficientScope.description,
		);
		// RFC 6750 §3.1: a token that is valid but lacks the scopes the
		// operation needs answers with 403 and an `insufficient_scope`
		// challenge naming them, so the client can step up via re-authorization.
		// `challengeScopes` is only a fallback: the scopes the token actually lacks
		// are the ones re-authorizing has to add.
		const scope = insufficientScope.scope || challengeScope;
		return new APIError(
			"FORBIDDEN",
			{ message: errorDescription },
			{
				"WWW-Authenticate": buildBearerChallenge(
					resource,
					opts,
					(metadataUrl) => [
						`error="insufficient_scope"`,
						scope && `scope="${quoteAuthParam(scope)}"`,
						`resource_metadata="${quoteAuthParam(metadataUrl)}"`,
						`error_description="${errorDescription}"`,
					],
				),
			},
		);
	}
	return undefined;
}
