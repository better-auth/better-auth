import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { setOAuthState } from "../api/middlewares/oauth";
import { generateRandomString } from "../crypto";
import type { StateData } from "../state";
import { generateGenericState, parseGenericState, StateError } from "../state";

export async function generateState(
	c: GenericEndpointContext,
	link:
		| {
				email: string;
				userId: string;
		  }
		| undefined,
	additionalData: Record<string, any> | false | undefined,
) {
	const callbackURL = c.body?.callbackURL || c.context.options.baseURL;
	if (!callbackURL) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.CALLBACK_URL_REQUIRED);
	}

	const state = generateRandomString(32);
	const codeVerifier = generateRandomString(128);

	const stateData: StateData = {
		...(additionalData ? additionalData : {}),
		callbackURL,
		codeVerifier,
		errorURL: c.body?.errorCallbackURL,
		newUserURL: c.body?.newUserCallbackURL,
		link,
		/**
		 * This is the actual expiry time of the state
		 */
		expiresAt: Date.now() + 10 * 60 * 1000,
		requestSignUp: c.body?.requestSignUp,
		state,
	};

	await setOAuthState(stateData);

	try {
		return await generateGenericState(c, stateData);
	} catch (error) {
		c.context.logger.error("Failed to create verification", error);
		throw APIError.from(
			"INTERNAL_SERVER_ERROR",
			BASE_ERROR_CODES.FAILED_TO_CREATE_VERIFICATION,
		);
	}
}

export async function parseState(c: GenericEndpointContext) {
	const state = c.query.state || c.body.state;
	const errorURL =
		c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;

	let parsedData: StateData;

	try {
		parsedData = await parseGenericState(c, state);
	} catch (error) {
		c.context.logger.error("Failed to parse state", error);

		if (
			error instanceof StateError &&
			error.code === "state_security_mismatch"
		) {
			throw c.redirect(`${errorURL}?error=state_mismatch`);
		}

		throw c.redirect(`${errorURL}?error=please_restart_the_process`);
	}

	if (!parsedData.errorURL) {
		parsedData.errorURL = errorURL;
	}

	if (parsedData) {
		await setOAuthState(parsedData);
	}

	return parsedData;
}
