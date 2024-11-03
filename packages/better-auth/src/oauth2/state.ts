import {
	generateCodeVerifier,
	generateState as generateSateCode,
} from "oslo/oauth2";
import { z } from "zod";
import type { GenericEndpointContext } from "../types";
import { APIError } from "better-call";
import { logger } from "../utils";
import { getOrigin } from "../utils/url";

export async function generateState(
	c: GenericEndpointContext,
	link?: {
		email: string;
		userId: string;
	},
) {
	const callbackURL =
		c.body?.callbackURL ||
		(c.query?.currentURL ? getOrigin(c.query?.currentURL) : "");
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
		link,
		/**
		 * This is the actual expiry time of the state
		 */
		expiresAt: Date.now() + 10 * 60 * 1000,
	});
	const expiresAt = new Date();
	expiresAt.setMinutes(expiresAt.getMinutes() + 10);
	const verification = await c.context.internalAdapter.createVerificationValue({
		value: data,
		identifier: state,
		expiresAt,
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
	if (!data) {
		logger.error("State Mismatch. Verification not found", {
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
			expiresAt: z.number(),
			link: z
				.object({
					email: z.string(),
					userId: z.string(),
				})
				.optional(),
		})
		.parse(JSON.parse(data.value));

	if (!parsedData.errorURL) {
		parsedData.errorURL = `${c.context.baseURL}/error`;
	}
	if (parsedData.expiresAt < Date.now()) {
		await c.context.internalAdapter.deleteVerificationValue(data.id);
		logger.error("State expired.", {
			state,
		});
		throw c.redirect(
			`${c.context.baseURL}/error?error=please_restart_the_process`,
		);
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
