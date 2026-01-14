import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-call";
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
		throw new APIError("BAD_REQUEST", {
			message: "callbackURL is required",
		});
	}

	const codeVerifier = generateRandomString(128);

	const stateData: StateData = {
		...(additionalData ? additionalData : {}),
		callbackURL,
		codeVerifier,
		errorURL: c.body?.errorCallbackURL,
		newUserURL: c.body?.newUserCallbackURL,
		link,
		expiresAt: Date.now() + 10 * 60 * 1000,
		requestSignUp: c.body?.requestSignUp,
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
