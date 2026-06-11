import { isAPIError } from "better-auth/api";
import { APIError } from "better-call";

/**
 * Raise the RFC 6750 `WWW-Authenticate: Bearer` challenge for a resource server.
 *
 * Given an error thrown while verifying a bearer token, this rethrows an
 * unauthorized error as a `401` carrying the RFC 9728 `resource_metadata`
 * pointer for each audience, and rethrows any other error unchanged. Non-URL
 * audiences (for example a `urn:` or a client id) resolve their metadata URL
 * through `resourceMetadataMappings`.
 *
 * @internal
 */
export function raiseResourceServerChallenge(
	error: unknown,
	resource: string | string[],
	opts?: {
		/** Maps non-URL (urn, client) resources to their resource_metadata URL. */
		resourceMetadataMappings?: Record<string, string>;
	},
): never {
	if (isAPIError(error) && error.status === "UNAUTHORIZED") {
		const resources = Array.isArray(resource) ? resource : [resource];
		const wwwAuthenticateValue = resources
			.map((value) => {
				// Opaque absolute URIs (for example `urn:`) parse with an
				// `origin` of "null", so only origin-based URLs derive the
				// well-known metadata URL; everything else needs an explicit
				// mapping.
				const url = URL.canParse?.(value) ? new URL(value) : null;
				if (url && url.origin !== "null") {
					const audiencePath = url.pathname.endsWith("/")
						? url.pathname.slice(0, -1)
						: url.pathname;
					return `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource${audiencePath}"`;
				}
				const resourceMetadata = opts?.resourceMetadataMappings?.[value];
				if (!resourceMetadata) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: `missing resource_metadata mapping for ${value}`,
					});
				}
				return `Bearer resource_metadata="${resourceMetadata}"`;
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
