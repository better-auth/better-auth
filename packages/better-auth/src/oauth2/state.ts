import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { getOAuthServerContext, setOAuthState } from "../api/state/oauth";
import { generateRandomString } from "../crypto";
import type { StateData } from "../state";
import { generateGenericState, parseGenericState, StateError } from "../state";
import { getUIErrorURL } from "../ui";
import { redirectOnError } from "./errors";

/**
 * Mint the OIDC `nonce` for the redirect flow, or `undefined` when the provider
 * does not require ID-token nonce binding. Every redirect entrypoint (social
 * sign-in, account linking, IDP-initiated bounce, and the OAuth popup) mints
 * through this helper, so the value sent on the authorization URL and the value
 * persisted in state are produced one way and cannot drift apart.
 */
export function generateIdTokenNonce(provider: {
	requiresIdTokenNonce?: boolean | undefined;
}): string | undefined {
	return provider.requiresIdTokenNonce ? generateRandomString(32) : undefined;
}

/**
 * Inputs for {@link generateState}. Grouped into one object so call sites read
 * by name instead of by position.
 */
export interface GenerateStateOptions {
	/** Link target when this flow links a provider identity to an existing user. */
	link?: { email: string; userId: string } | undefined;
	/** Extra data to round-trip through state; `false` writes none. */
	additionalData?: Record<string, any> | false | undefined;
	/** The `state` nonce already used to build the authorization URL. Minted when omitted. */
	state?: string | undefined;
	/** The PKCE `codeVerifier` already used to build the authorization URL. Minted when omitted. */
	codeVerifier?: string | undefined;
	/** The OIDC nonce already sent as the authorization URL `nonce` parameter. */
	idTokenNonce?: string | undefined;
}

export async function generateState(
	c: GenericEndpointContext,
	options?: GenerateStateOptions,
) {
	const callbackURL = c.body?.callbackURL || c.context.options.baseURL;
	if (!callbackURL) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.CALLBACK_URL_REQUIRED);
	}

	const codeVerifier = options?.codeVerifier ?? generateRandomString(128);

	const pendingServerContext = await getOAuthServerContext();
	const serverContext =
		pendingServerContext && Object.keys(pendingServerContext).length
			? pendingServerContext
			: undefined;

	const stateData: StateData = {
		...(options?.additionalData ? options.additionalData : {}),
		callbackURL,
		codeVerifier,
		errorURL: c.body?.errorCallbackURL,
		newUserURL: c.body?.newUserCallbackURL,
		link: options?.link,
		// Assigned after the client-controlled `additionalData` spread so a client
		// cannot smuggle a `serverContext` of its own through the request body.
		serverContext,
		expiresAt: Date.now() + 10 * 60 * 1000,
		requestSignUp: c.body?.requestSignUp,
		idTokenNonce: options?.idTokenNonce,
	};

	await setOAuthState(stateData);

	try {
		return generateGenericState(c, stateData);
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
	const errorURL = getUIErrorURL(c.context);

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
