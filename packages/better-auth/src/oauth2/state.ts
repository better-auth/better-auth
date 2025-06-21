import { z } from "zod";
import type { GenericEndpointContext } from "../types";
import type { OAuthStatePayload } from "./types";
import { APIError } from "better-call";
import { generateRandomString } from "../crypto";

/**
 * Generate OAuth state using database verification storage
 * This function can be used by custom state management implementations
 * that want to fall back to the default database-based approach
 */
export async function generateVerificationState(
	c: GenericEndpointContext,
	payload: OAuthStatePayload,
): Promise<string> {
	const identifier = generateRandomString(32);
	const expiresAt = new Date(payload.expiresAt);
	const verification = await c.context.internalAdapter.createVerificationValue(
		{
			value: JSON.stringify(payload),
			identifier,
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
	return identifier;
}

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

	const payload: OAuthStatePayload = {
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
	};

	let state: string | undefined;

	// Check for custom state management
	const customGenerateState =
		c.context.options.oauth?.stateManagement?.generateState;
	if (customGenerateState) {
		state = await customGenerateState(c, payload);
	}

	// Fallback to existing behavior if no custom state was generated
	if (!state) {
		state = await generateVerificationState(c, payload);
	}

	return {
		state,
		codeVerifier: payload.codeVerifier,
	};
}

/**
 * Parse OAuth state from database verification storage
 * This function can be used by custom state management implementations
 * that want to fall back to the default database-based approach
 */
export async function parseVerificationState(
	c: GenericEndpointContext,
	state: string,
): Promise<OAuthStatePayload> {
	const data = await c.context.internalAdapter.findVerificationValue(state);
	if (!data) {
		c.context.logger.error("State Mismatch. Verification not found", {
			state,
		});
		const errorURL =
			c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
		throw c.redirect(`${errorURL}?error=please_restart_the_process`);
	}

	// Parse the JSON data
	const parsedData = JSON.parse(data.value);

	// Clean up the verification record
	await c.context.internalAdapter.deleteVerificationValue(data.id);

	return parsedData;
}

export async function parseState(c: GenericEndpointContext) {
	const state = c.query.state || c.body.state;
	let data: OAuthStatePayload | undefined;

	// Check for custom state management
	const customParseState = c.context.options.oauth?.stateManagement?.parseState;
	if (customParseState) {
		data = await customParseState(c, state);
	}

	// Fallback to existing behavior if no custom parsing was successful
	if (!data) {
		data = await parseVerificationState(c, state);
	}

	// Validate the parsed data
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
		.parse(data);

	if (!parsedData.errorURL) {
		parsedData.errorURL = `${c.context.baseURL}/error`;
	}
	if (parsedData.expiresAt < Date.now()) {
		const errorURL =
			c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
		throw c.redirect(`${errorURL}?error=please_restart_the_process`);
	}
	return parsedData;
}
