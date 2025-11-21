/**
 * @see https://openid.net/specs/openid-connect-core-1_0.html#AuthError
 * @see https://www.rfc-editor.org/rfc/rfc6749.html#section-5.2
 */
import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-call";

export class OIDCProviderError extends APIError {}

export class InvalidRequest extends OIDCProviderError {
	constructor(error_description: string, error_detail?: string) {
		super("BAD_REQUEST", {
			message: "invalid_request",
			error_description,
			error_detail,
		});
	}
}

export class InvalidGrant extends OIDCProviderError {
	constructor(error_description: string) {
		super("BAD_REQUEST", {
			message: "invalid_grant",
			error: "invalid_grant",
			error_description,
		});
	}
}

export class UnsupportedGrantType extends OIDCProviderError {
	constructor(error_description: string) {
		super("BAD_REQUEST", {
			message: "unsupported_grant_type",
			error: "unsupported_grant_type",
			error_description,
		});
	}
}

/**
 * InvalidClient error for OAuth 2.0 token endpoint.
 * Per RFC 6749 Section 5.2:
 * - Default: HTTP 400 (Bad Request)
 * - If client used Authorization header: HTTP 401 (Unauthorized) with WWW-Authenticate header
 */
export class InvalidClient extends OIDCProviderError {
	private constructor(
		error_description: string,
		usedAuthorizationHeader: boolean,
	) {
		// Per RFC 6749 Section 5.2: Use 401 if client used Authorization header
		const statusCode = usedAuthorizationHeader ? "UNAUTHORIZED" : "BAD_REQUEST";

		super(statusCode, {
			message: "invalid_client",
			error: "invalid_client",
			error_description,
		});
	}

	/**
	 * Return a JSON response with proper headers per RFC 6749 Section 5.2.
	 * If client used Authorization header, includes WWW-Authenticate header.
	 */
	static respond(
		ctx: GenericEndpointContext,
		error_description: string,
		usedAuthorizationHeader: boolean = false,
	) {
		ctx.setHeader("Cache-Control", "no-store");
		ctx.setHeader("Pragma", "no-cache");
		// RFC 6749 Section 5.2: MUST include WWW-Authenticate when client used Authorization header
		if (usedAuthorizationHeader) {
			ctx.setHeader("WWW-Authenticate", `Basic realm="token"`);
		}

		return new InvalidClient(error_description, usedAuthorizationHeader);
	}
}
