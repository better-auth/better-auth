import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-call";
import * as z from "zod";
import { setOAuthState } from "../api/middlewares/oauth";
import {
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../crypto";

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
	const state = generateRandomString(32);
	const storeStateStrategy =
		c.context.oauthConfig?.storeStateStrategy || "cookie";

	const stateData = {
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
	};

	await setOAuthState(stateData);

	if (storeStateStrategy === "cookie") {
		// Store state data in an encrypted cookie
		const encryptedData = await symmetricEncrypt({
			key: c.context.secret,
			data: JSON.stringify(stateData),
		});

		const stateCookie = c.context.createAuthCookie("oauth_state", {
			maxAge: 10 * 60 * 1000, // 10 minutes
		});

		c.setCookie(stateCookie.name, encryptedData, stateCookie.attributes);

		return {
			state,
			codeVerifier,
		};
	}

	// Default: database strategy
	const stateCookie = c.context.createAuthCookie("state", {
		maxAge: 5 * 60 * 1000, // 5 minutes
	});
	await c.setSignedCookie(
		stateCookie.name,
		state,
		c.context.secret,
		stateCookie.attributes,
	);

	const expiresAt = new Date();
	expiresAt.setMinutes(expiresAt.getMinutes() + 10);
	const verification = await c.context.internalAdapter.createVerificationValue({
		value: JSON.stringify(stateData),
		identifier: state,
		expiresAt,
	});
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
	const storeStateStrategy =
		c.context.oauthConfig.storeStateStrategy || "cookie";

	const stateDataSchema = z.looseObject({
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
	});

	let parsedData: z.infer<typeof stateDataSchema>;

	if (storeStateStrategy === "cookie") {
		// Retrieve state data from encrypted cookie
		const stateCookie = c.context.createAuthCookie("oauth_state");
		const encryptedData = c.getCookie(stateCookie.name);

		if (!encryptedData) {
			c.context.logger.error("State Mismatch. OAuth state cookie not found", {
				state,
			});
			const errorURL =
				c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
			throw c.redirect(`${errorURL}?error=please_restart_the_process`);
		}

		try {
			const decryptedData = await symmetricDecrypt({
				key: c.context.secret,
				data: encryptedData,
			});

			parsedData = stateDataSchema.parse(JSON.parse(decryptedData));
		} catch (error) {
			c.context.logger.error("Failed to decrypt or parse OAuth state cookie", {
				error,
			});
			const errorURL =
				c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
			throw c.redirect(`${errorURL}?error=please_restart_the_process`);
		}

		// Clear the cookie after successful parsing
		c.setCookie(stateCookie.name, "", {
			maxAge: 0,
		});
	} else {
		// Default: database strategy
		const data = await c.context.internalAdapter.findVerificationValue(state);
		if (!data) {
			c.context.logger.error("State Mismatch. Verification not found", {
				state,
			});
			const errorURL =
				c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
			throw c.redirect(`${errorURL}?error=please_restart_the_process`);
		}

		parsedData = stateDataSchema.parse(JSON.parse(data.value));

		const stateCookie = c.context.createAuthCookie("state");
		const stateCookieValue = await c.getSignedCookie(
			stateCookie.name,
			c.context.secret,
		);
		/**
		 * This is generally cause security issue and should only be used in
		 * dev or staging environments. It's currently used by the oauth-proxy
		 * plugin
		 */
		const skipStateCookieCheck = c.context.oauthConfig?.skipStateCookieCheck;
		if (
			!skipStateCookieCheck &&
			(!stateCookieValue || stateCookieValue !== state)
		) {
			const errorURL =
				c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
			throw c.redirect(`${errorURL}?error=state_mismatch`);
		}
		c.setCookie(stateCookie.name, "", {
			maxAge: 0,
		});

		// Delete verification value after retrieval
		await c.context.internalAdapter.deleteVerificationValue(data.id);
	}

	if (!parsedData.errorURL) {
		parsedData.errorURL =
			c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
	}

	// Check expiration
	if (parsedData.expiresAt < Date.now()) {
		const errorURL =
			c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
		throw c.redirect(`${errorURL}?error=please_restart_the_process`);
	}

	if (parsedData) {
		await setOAuthState(parsedData);
	}

	return parsedData;
}
