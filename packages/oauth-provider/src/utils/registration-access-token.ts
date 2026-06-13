import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-call";
import type {
	ClientRegistrationRequest,
	InitialAccessTokenAuthorization,
	OAuthOptions,
	Scope,
} from "../types";
import { OAUTH_NO_STORE_HEADERS, parseBearerToken } from "./index";

/**
 * Builds an RFC 6750 §3 Bearer challenge for the registration endpoint. The
 * `error` code maps to the status per RFC 6750 §3.1 (`invalid_request` → 400,
 * `invalid_token` → 401, `insufficient_scope` → 403) and is echoed in both the
 * `WWW-Authenticate` challenge and the JSON body.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6750#section-3
 */
export function registrationBearerError(
	status: "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN",
	error: "invalid_request" | "invalid_token" | "insufficient_scope",
	errorDescription: string,
) {
	return new APIError(
		status,
		{ error, error_description: errorDescription },
		{
			"WWW-Authenticate": `Bearer error="${error}"`,
			...OAUTH_NO_STORE_HEADERS,
		},
	);
}

/**
 * Resolves an RFC 7591 initial access token from the request and authorizes it
 * against the deployment-supplied validator.
 *
 * Returns the authorization (optionally carrying a `referenceId`) when a valid
 * token is present, or `undefined` when no Bearer credentials were sent so the
 * caller can fall back to session or open registration. Throws an RFC 6750
 * Bearer challenge when the header is malformed, no validator is configured, or
 * the token is rejected.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7591#section-3
 */
export async function authorizeInitialAccessToken(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	clientMetadata: ClientRegistrationRequest,
): Promise<InitialAccessTokenAuthorization | undefined> {
	const headers = ctx.headers;
	let initialAccessToken: string | undefined;
	try {
		initialAccessToken = parseBearerToken(headers?.get("authorization"));
	} catch {
		throw registrationBearerError(
			"BAD_REQUEST",
			"invalid_request",
			"Malformed initial access token Authorization header",
		);
	}
	if (!initialAccessToken || !headers) {
		return undefined;
	}

	// Reject a presented token when no validator is wired up rather than letting
	// it fall through to the weaker open-registration path (fail-closed). The
	// description stays generic so an unauthenticated caller cannot distinguish
	// "no validator configured" from "token rejected".
	if (!opts.validateInitialAccessToken) {
		throw registrationBearerError(
			"UNAUTHORIZED",
			"invalid_token",
			"Invalid initial access token",
		);
	}

	const authorization = await opts.validateInitialAccessToken({
		initialAccessToken,
		headers,
		clientMetadata,
	});
	if (!authorization) {
		throw registrationBearerError(
			"UNAUTHORIZED",
			"invalid_token",
			"Invalid initial access token",
		);
	}

	return authorization;
}
