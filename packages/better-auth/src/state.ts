import type { GenericEndpointContext } from "@better-auth/core";
import * as z from "zod";
import {
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "./crypto";

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
	state: z.string().optional(),
});

export type StateData = z.infer<typeof stateDataSchema>;

export type StateErrorCode =
	| "state_generation_error"
	| "state_invalid"
	| "state_mismatch"
	| "state_security_mismatch";

export class StateError extends Error {
	code: string;
	details?: Record<string, any>;

	constructor(
		message: string,
		opts: { code: StateErrorCode; details?: Record<string, any> },
		errorOptions?: ErrorOptions,
	) {
		super(message, errorOptions);
		this.code = opts.code;
		this.details = opts.details;
	}
}

export async function generateGenericState(
	c: GenericEndpointContext,
	stateData: StateData,
	settings?: { cookieName: string },
) {
	const state = stateData.state ?? generateRandomString(32);
	const storeStateStrategy = c.context.oauthConfig.storeStateStrategy;

	if (storeStateStrategy === "cookie") {
		// Store state data in an encrypted cookie

		const encryptedData = await symmetricEncrypt({
			key: c.context.secret,
			data: JSON.stringify(stateData),
		});

		const stateCookie = c.context.createAuthCookie(
			settings?.cookieName ?? "oauth_state",
			{
				maxAge: 10 * 60 * 1000, // 10 minutes
			},
		);

		c.setCookie(stateCookie.name, encryptedData, stateCookie.attributes);

		return {
			state: state,
			codeVerifier: stateData.codeVerifier,
		};
	}

	// Default: database strategy

	const stateCookie = c.context.createAuthCookie(
		settings?.cookieName ?? "state",
		{
			maxAge: 5 * 60 * 1000, // 5 minutes
		},
	);

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
		throw new StateError(
			"Unable to create verification. Make sure the database adapter is properly working and there is a verification table in the database",
			{
				code: "state_generation_error",
			},
		);
	}

	return {
		state: verification.identifier,
		codeVerifier: stateData.codeVerifier,
	};
}

export async function parseGenericState(
	c: GenericEndpointContext,
	state: string,
	settings?: { cookieName: string },
) {
	const storeStateStrategy = c.context.oauthConfig.storeStateStrategy;
	let parsedData: StateData;

	/**
	 * This is generally cause security issue and should only be used in
	 * dev or staging environments. It's currently used by the oauth-proxy
	 * plugin
	 */
	const skipStateCookieCheck = c.context.oauthConfig?.skipStateCookieCheck;

	if (storeStateStrategy === "cookie") {
		// Retrieve state data from encrypted cookie
		const stateCookie = c.context.createAuthCookie(
			settings?.cookieName ?? "oauth_state",
		);
		const encryptedData = c.getCookie(stateCookie.name);

		if (!encryptedData) {
			throw new StateError("State mismatch: auth state cookie not found", {
				code: "state_mismatch",
				details: { state },
			});
		}

		try {
			const decryptedData = await symmetricDecrypt({
				key: c.context.secret,
				data: encryptedData,
			});

			parsedData = stateDataSchema.parse(JSON.parse(decryptedData));
		} catch (error) {
			throw new StateError(
				"State invalid: Failed to decrypt or parse auth state",
				{
					code: "state_invalid",
					details: { state },
				},
				{ cause: error },
			);
		}

		if (
			!skipStateCookieCheck &&
			parsedData.state &&
			parsedData.state !== state
		) {
			throw new StateError("State mismatch: State not persisted correctly", {
				code: "state_security_mismatch",
				details: { state },
			});
		}

		// Clear the cookie after successful parsing
		c.setCookie(stateCookie.name, "", {
			maxAge: 0,
		});
	} else {
		// Default: database strategy
		const data = await c.context.internalAdapter.findVerificationValue(state);
		if (!data) {
			throw new StateError("State mismatch: verification not found", {
				code: "state_mismatch",
				details: { state },
			});
		}

		parsedData = stateDataSchema.parse(JSON.parse(data.value));

		const stateCookie = c.context.createAuthCookie(
			settings?.cookieName ?? "state",
		);

		const stateCookieValue = await c.getSignedCookie(
			stateCookie.name,
			c.context.secret,
		);

		if (
			!skipStateCookieCheck &&
			(!stateCookieValue || stateCookieValue !== state)
		) {
			throw new StateError("State mismatch: State not persisted correctly", {
				code: "state_security_mismatch",
				details: { state },
			});
		}

		c.setCookie(stateCookie.name, "", {
			maxAge: 0,
		});

		// Delete verification value after retrieval
		await c.context.internalAdapter.deleteVerificationValue(data.id);
	}

	// Check expiration
	if (parsedData.expiresAt < Date.now()) {
		throw new StateError("Invalid state: request expired", {
			code: "state_mismatch",
			details: {
				expiresAt: parsedData.expiresAt,
			},
		});
	}

	return parsedData;
}
