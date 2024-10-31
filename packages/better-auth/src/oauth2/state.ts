import { generateCodeVerifier } from "oslo/oauth2";
import { z } from "zod";
import { hmac } from "../crypto/hash";
import type { GenericEndpointContext } from "../types";
import { APIError } from "better-call";
import { logger } from "../utils";
import { checkURLValidity } from "../utils/url";

export async function generateState(c: GenericEndpointContext) {
	const callbackURL = c.body?.callbackURL;
	if (!callbackURL) {
		throw new APIError("BAD_REQUEST", {
			message: "callbackURL is required",
		});
	}
	const codeVerifier = generateCodeVerifier();
	const data = JSON.stringify({
		callbackURL,
		codeVerifier,
		errorURL: c.query?.currentURL,
	});
	const signedHash = await hmac.sign({
		secret: c.context.secret,
		value: data,
	});
	const state = JSON.stringify({
		data,
		signature: signedHash,
	});
	if (state.length > 1000) {
		logger.error(
			"The generated State is too long. Make sure your callbackURL is not too long.",
		);
		throw new APIError("BAD_REQUEST", {
			message:
				"The generated State is too long. Make sure your callbackURL is not too long.",
		});
	}
	return {
		state,
		codeVerifier,
	};
}

export async function parseState(c: GenericEndpointContext) {
	const state = c.query.state;
	const data = z
		.object({
			data: z.string(),
			signature: z.string(),
		})
		.safeParse(JSON.parse(state));
	if (!data.success) {
		logger.error("Unable to parse state", {
			zodError: data.error,
			state,
		});
		throw c.redirect(
			`${c.context.baseURL}/error?error=please_restart_the_process`,
		);
	}
	const isValidState = await hmac.verify({
		value: data.data.data,
		signature: data.data.signature,
		secret: c.context.secret,
	});
	if (!isValidState) {
		logger.error("OAuth state mismatch");
		throw c.redirect(
			`${c.context.baseURL}/error?error=please_restart_the_process`,
		);
	}
	const parsedData = z
		.object({
			callbackURL: z.string(),
			codeVerifier: z.string(),
			errorURL: z.string().optional(),
		})
		.parse(JSON.parse(data.data.data));
	if (!parsedData.errorURL) {
		parsedData.errorURL = `${c.context.baseURL}/error`;
	}
	const isFullURL = checkURLValidity(parsedData.callbackURL);
	if (!isFullURL) {
		parsedData.callbackURL = `${c.context.options.baseURL}${parsedData.callbackURL}`;
	}
	return parsedData as {
		callbackURL: string;
		codeVerifier: string;
		link?: {
			email: string;
			userId: string;
		};
		errorURL: string;
	};
}
