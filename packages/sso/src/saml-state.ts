import type { GenericEndpointContext, StateData } from "better-auth";
import { generateGenericState, parseGenericState } from "better-auth";
import { generateRandomString } from "better-auth/crypto";
import { APIError } from "better-call";

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
		throw new APIError("BAD_REQUEST", {
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
		return await generateGenericState(c, stateData, {
			cookieName: "relay_state",
		});
	} catch (error) {
		c.context.logger.error(
			"Failed to create verification for relay state",
			error,
		);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "State error: Unable to create verification for relay state",
			cause: error,
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
		throw new APIError("BAD_REQUEST", {
			message: "State error: failed to validate relay state",
			cause: error,
		});
	}

	if (!parsedData.errorURL) {
		parsedData.errorURL = errorURL;
	}

	return parsedData;
}
