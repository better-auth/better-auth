import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { setOAuthState } from "../api/state/oauth";
import { generateRandomString } from "../crypto";
import type { StateData } from "../state";
import { generateGenericState, parseGenericState, StateError } from "../state";
import { redirectOnError } from "./errors";

export async function generateState(
	c: GenericEndpointContext,
	link:
		| {
				email: string;
				userId: string;
		  }
		| undefined,
	additionalData: Record<string, any> | false | undefined,
	/**
	 * The effective set of scopes encoded in the authorization URL, captured
	 * from `createAuthorizationURL`. Persisted into OAuth state so the callback
	 * can fall back to the request when the provider omits `scope` from its
	 * token response (RFC 6749 §5.1). Because the effective set is only known
	 * after `createAuthorizationURL` runs, callers build the URL first, then
	 * pass the URL's `state`/`codeVerifier` back through `precomputed` so state
	 * is still written exactly once.
	 */
	requestedScopes?: string[],
	/**
	 * The `state` nonce and `codeVerifier` already used to build the
	 * authorization URL. When omitted, fresh values are minted.
	 */
	precomputed?: { state: string; codeVerifier: string },
) {
	const callbackURL = c.body?.callbackURL || c.context.options.baseURL;
	if (!callbackURL) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.CALLBACK_URL_REQUIRED);
	}

	const codeVerifier = precomputed?.codeVerifier ?? generateRandomString(128);

	const stateData: StateData = {
		...(additionalData ? additionalData : {}),
		callbackURL,
		codeVerifier,
		errorURL: c.body?.errorCallbackURL,
		newUserURL: c.body?.newUserCallbackURL,
		link,
		expiresAt: Date.now() + 10 * 60 * 1000,
		requestSignUp: c.body?.requestSignUp,
		requestedScopes,
	};

	await setOAuthState(stateData);

	try {
		return generateGenericState(c, stateData, {
			oauthState: precomputed?.state,
		});
	} catch (error) {
		c.context.logger.error("Failed to create verification", error);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Unable to create verification",
			cause: error,
		});
	}
}

export async function parseState(c: GenericEndpointContext) {
	const state = c.query.state || c.body?.state;
	const errorURL =
		c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;

	let parsedData: StateData;

	try {
		parsedData = await parseGenericState(c, state);
	} catch (error) {
		c.context.logger.error("Failed to parse state", error);

		let code = "internal_server_error";
		let redirectErrorURL = errorURL;
		if (error instanceof StateError) {
			code =
				error.code === "state_security_mismatch"
					? "state_mismatch"
					: error.code;
			redirectErrorURL = error.errorURL ?? errorURL;
		}
		redirectOnError(c, redirectErrorURL, code);
	}

	if (!parsedData.errorURL) {
		parsedData.errorURL = errorURL;
	}

	if (parsedData) {
		await setOAuthState(parsedData);
	}

	return parsedData;
}
