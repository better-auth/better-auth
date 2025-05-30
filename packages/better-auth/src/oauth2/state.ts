import { z } from "zod";
import type { GenericEndpointContext } from "../types";
import { APIError } from "better-call";
import { generateRandomString } from "../crypto";

export async function generateState(
	c: GenericEndpointContext,
	link?: {
		email: string;
		userId: string;
	},
) {
	const callbackURL = c.body?.callbackURL || c.context.options.baseURL;
	if (!callbackURL) {
		throw new APIError("BAD_REQUEST", {
			message: "callbackURL is required",
		});
	}
	const codeVerifier = generateRandomString(128);
	const state = generateRandomString(32);
	const data = JSON.stringify({
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
	});
	const expiresAt = new Date();
	expiresAt.setMinutes(expiresAt.getMinutes() + 10);
	const verification = await c.context.internalAdapter.createVerificationValue(
		{
			value: data,
			identifier: state,
			expiresAt,
		},
		c,
	);
	if (!verification) {
		c.context.logger.error(
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
	const state = c.query.state || c.body.state;
	const data = await c.context.internalAdapter.findVerificationValue(state);
	if (!data) {
		c.context.logger.error("State Mismatch. Verification not found", {
			state,
		});
		throw c.redirect(
			`${c.context.baseURL}/error?error=please_restart_the_process`,
		);
	}
	const parsedData = z
		.object({
			callbackURL: z.string(),
			codeVerifier: z.string(),
			errorURL: z.string().optional(),
			newUserURL: z.string().optional(),
			expiresAt: z.number(),
			link: z
				.object({
					email: z.string(),
					userId: z.coerce.string(),
				})
				.optional(),
			requestSignUp: z.boolean().optional(),
		})
		.parse(JSON.parse(data.value));

	if (!parsedData.errorURL) {
		parsedData.errorURL = `${c.context.baseURL}/error`;
	}
	if (parsedData.expiresAt < Date.now()) {
		await c.context.internalAdapter.deleteVerificationValue(data.id);
		throw c.redirect(
			`${c.context.baseURL}/error?error=please_restart_the_process`,
		);
	}
	await c.context.internalAdapter.deleteVerificationValue(data.id);
	return parsedData;
}
