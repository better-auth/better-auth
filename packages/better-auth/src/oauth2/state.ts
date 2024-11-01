import {
	generateCodeVerifier,
	generateState as generateSateCode,
} from "oslo/oauth2";
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
	const state = generateSateCode();
	const data = JSON.stringify({
		callbackURL,
		codeVerifier,
		errorURL: c.query?.currentURL,
	});

	const verification = await c.context.internalAdapter.createVerificationValue({
		value: data,
		identifier: state,
		expiresAt: new Date(Date.now() + 1000 * 60 * 10),
	});
	if (!verification) {
		logger.error(
			"Unable to create verification. Make sure the database adapter is properly working and there is a verification table in the database",
		);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Unable to create verification",
		});
	}
	return {
		state: verification.identifier,
		codeVerifier,
	};
}

export async function parseState(c: GenericEndpointContext) {
	const state = c.query.state;
	const data = await c.context.internalAdapter.findVerificationValue(state);
	if (!data || data.expiresAt < new Date()) {
		if (data) {
			await c.context.internalAdapter.deleteVerificationValue(data.id);
			logger.error("State expired.", {
				state,
			});
		} else {
			logger.error("State Mismatch. Verification not found", {
				state,
			});
		}
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
		.parse(JSON.parse(data.value));
	if (!parsedData.errorURL) {
		parsedData.errorURL = `${c.context.baseURL}/error`;
	}
	const isFullURL = checkURLValidity(parsedData.callbackURL);
	if (!isFullURL) {
		const origin = new URL(c.context.baseURL).origin;
		parsedData.callbackURL = `${origin}${parsedData.callbackURL}`;
	}
	await c.context.internalAdapter.deleteVerificationValue(data.id);
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
