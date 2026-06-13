import { isAPIError } from "better-auth/api";
import { DPOP_SIGNING_ALGORITHMS } from "better-auth/oauth2";
import { APIError } from "better-call";

const DPOP_CHALLENGE_ERRORS = new Set(["invalid_dpop_proof", "use_dpop_nonce"]);

function quoteAuthParam(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getApiErrorBody(error: APIError):
	| {
			error?: unknown;
			error_description?: unknown;
			message?: unknown;
	  }
	| undefined {
	return error.body as
		| {
				error?: unknown;
				error_description?: unknown;
				message?: unknown;
		  }
		| undefined;
}

function isDpopChallengeError(error: APIError) {
	const body = getApiErrorBody(error);
	const errorCode = typeof body?.error === "string" ? body.error : undefined;
	const description =
		typeof body?.error_description === "string"
			? body.error_description
			: typeof body?.message === "string"
				? body.message
				: error.message;
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
	const body = getApiErrorBody(error);
	const errorCode =
		typeof body?.error === "string" ? body.error : "invalid_dpop_proof";
	const description =
		typeof body?.error_description === "string"
			? body.error_description
			: typeof body?.message === "string"
				? body.message
				: error.message;
	const algorithms = opts?.dpopSigningAlgorithms ?? DPOP_SIGNING_ALGORITHMS;
	return [
		`DPoP error="${quoteAuthParam(errorCode)}"`,
		`error_description="${quoteAuthParam(description)}"`,
		`algs="${quoteAuthParam(algorithms.join(" "))}"`,
	].join(", ");
}

/**
 * Raise an OAuth resource-server challenge for a failed access-token request.
 *
 * Missing/invalid bearer credentials are reported with RFC 6750 plus the RFC
 * 9728 `resource_metadata` pointer. DPoP-bound-token failures are reported with
 * RFC 9449's `DPoP` challenge so clients know which proof algorithms to use.
 * Non-URL resources (for example a `urn:` or a client id) resolve their
 * metadata URL through `resourceMetadataMappings`.
 *
 * @internal
 */
export function raiseResourceServerChallenge(
	error: unknown,
	resource: string | string[],
	opts?: {
		/** Maps non-URL (urn, client) resources to their resource_metadata URL. */
		resourceMetadataMappings?: Record<string, string>;
		/** DPoP JWS algorithms to advertise in RFC 9449 challenges. */
		dpopSigningAlgorithms?: readonly string[];
		/** Space-delimited scopes to advertise in RFC 6750 bearer challenges. */
		scope?: string;
	},
): never {
	if (isAPIError(error) && error.status === "UNAUTHORIZED") {
		if (isDpopChallengeError(error)) {
			throw new APIError(
				"UNAUTHORIZED",
				{ message: error.message },
				{ "WWW-Authenticate": buildDpopChallenge(error, opts) },
			);
		}
		const resources = Array.isArray(resource) ? resource : [resource];
		const wwwAuthenticateValue = resources
			.map((value) => {
				// Opaque absolute URIs (for example `urn:`) parse with an
				// `origin` of "null", so only origin-based URLs derive the
				// well-known metadata URL; everything else needs an explicit
				// mapping.
				const url = URL.canParse?.(value) ? new URL(value) : null;
				if (url && url.origin !== "null") {
					const resourcePath = url.pathname.endsWith("/")
						? url.pathname.slice(0, -1)
						: url.pathname;
					let challenge = `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource${resourcePath}${url.search}"`;
					if (opts?.scope) {
						challenge += `, scope="${quoteAuthParam(opts.scope)}"`;
					}
					return challenge;
				}
				const resourceMetadata = opts?.resourceMetadataMappings?.[value];
				if (!resourceMetadata) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: `missing resource_metadata mapping for ${value}`,
					});
				}
				let challenge = `Bearer resource_metadata="${resourceMetadata}"`;
				if (opts?.scope) {
					challenge += `, scope="${quoteAuthParam(opts.scope)}"`;
				}
				return challenge;
			})
			.join(", ");
		throw new APIError(
			"UNAUTHORIZED",
			{ message: error.message },
			{ "WWW-Authenticate": wwwAuthenticateValue },
		);
	}
	if (error instanceof Error) {
		throw error;
	}
	throw new Error(error as unknown as string);
}
