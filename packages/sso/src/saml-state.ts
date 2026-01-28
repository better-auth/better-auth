import { APIError } from "@better-auth/core/error";
import type { GenericEndpointContext, StateData } from "better-auth";
import { generateGenericState, parseGenericState } from "better-auth";
import { generateRandomString } from "better-auth/crypto";

export async function generateRelayState(
	c: GenericEndpointContext,
	link:
		| {
				email: string;
				userId: string;
		  }
		| undefined,
	additionalData: Record<string, any> | false | undefined,
) {
	const callbackURL = c.body.callbackURL;
	if (!callbackURL) {
		throw APIError.from("BAD_REQUEST", {
			code: "CALLBACK_URL_REQUIRED",
			message: "callbackURL is required",
		});
	}

	const codeVerifier = generateRandomString(128);
	const stateData: StateData = {
		...(additionalData ? additionalData : {}),
		callbackURL,
		codeVerifier,
		errorURL: c.body.errorCallbackURL,
		newUserURL: c.body.newUserCallbackURL,
		link,
		/**
		 * This is the actual expiry time of the state
		 */
		expiresAt: Date.now() + 10 * 60 * 1000,
		requestSignUp: c.body.requestSignUp,
	};

	try {
		return generateGenericState(c, stateData, {
			cookieName: "relay_state",
		});
	} catch (error) {
		c.context.logger.error(
			"Failed to create verification for relay state",
			error,
		);
		throw APIError.from("INTERNAL_SERVER_ERROR", {
			code: "RELAY_STATE_CREATION_FAILED",
			message: "State error: Unable to create verification for relay state",
		});
	}
}

export async function parseRelayState(c: GenericEndpointContext) {
	const state = c.body.RelayState;
	const errorURL =
		c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;

	let parsedData: StateData;

	try {
		parsedData = await parseGenericState(c, state, {
			cookieName: "relay_state",
		});
	} catch (error) {
		c.context.logger.error("Failed to parse relay state", error);
		throw APIError.from("BAD_REQUEST", {
			code: "RELAY_STATE_VALIDATION_FAILED",
			message: "State error: failed to validate relay state",
		});
	}

	if (!parsedData.errorURL) {
		parsedData.errorURL = errorURL;
	}

	return parsedData;
}
