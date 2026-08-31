import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import * as z from "zod";
import { expireCookie } from "./cookies";
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
	/**
	 * CSRF nonce returned to the OAuth provider. When using cookie state storage,
	 * this must match the callback `state` query parameter.
	 */
	oauthState: z.string().optional(),
	link: z
		.object({
			email: z.string(),
			userId: z.coerce.string(),
		})
		.optional(),
	requestSignUp: z.boolean().optional(),
	/**
	 * OIDC nonce sent as the authorization request `nonce` parameter when the
	 * provider requires an ID token to be bound to this redirect flow.
	 */
	idTokenNonce: z.string().optional(),
	/**
	 * Server-controlled values that ride the state across the provider redirect.
	 * Populated only by `generateState` from `addOAuthServerContext`, never from
	 * the request body, so it is safe to trust on the callback.
	 */
	serverContext: z.record(z.string(), z.unknown()).optional(),
});

export type StateData = z.infer<typeof stateDataSchema>;

/**
 * Sign-ins that overlap in time share one cookie, so each response rewrites it
 * from the snapshot its own request carried. Sequential flows (a second tab, a
 * retry, a stale authorize URL) are preserved. Two requests genuinely in flight
 * at the same instant still resolve last-write-wins, which is what a single
 * cookie can express; the database strategy has no such limit.
 */
const MAX_PENDING_STATES = 5;

/**
 * Browsers cap a cookie at roughly 4KB including its name and attributes, and
 * silently drop anything larger. Flows carrying long callback URLs or server
 * context can reach that before the entry cap does.
 */
const MAX_STATE_COOKIE_LENGTH = 3500;

/** Cookies written before multi-flow support hold one state rather than a list. */
const stateCookieSchema = z.union([z.array(stateDataSchema), stateDataSchema]);

export function toPendingStates(value: unknown): StateData[] {
	const parsed = stateCookieSchema.parse(value);
	return Array.isArray(parsed) ? parsed : [parsed];
}

async function readPendingStates(
	c: GenericEndpointContext,
	cookieName: string,
): Promise<StateData[]> {
	const encryptedData = c.getCookie(cookieName);
	if (!encryptedData) return [];

	try {
		return toPendingStates(
			JSON.parse(
				await symmetricDecrypt({
					key: c.context.secretConfig,
					data: encryptedData,
				}),
			),
		);
	} catch {
		// An unreadable cookie is replaced rather than failing the new sign-in.
		return [];
	}
}

export const INTERNAL_STATE_KEYS: ReadonlySet<string> = new Set(
	Object.keys(stateDataSchema.shape),
);

export type StateErrorCode =
	| "state_generation_error"
	| "state_not_found"
	| "state_invalid"
	| "state_mismatch"
	| "state_security_mismatch";

export class StateError extends BetterAuthError {
	code: string;
	details?: Record<string, any>;
	/**
	 * The per-flow `errorCallbackURL` recovered from the parsed state, when the
	 * failure happened after the state was successfully parsed (for example a
	 * nonce or state-cookie mismatch). It was origin-validated at sign-in, so
	 * the callback can safely redirect there instead of the default error page.
	 * Absent when the state could not be parsed at all.
	 */
	errorURL?: string;

	constructor(
		message: string,
		options: ErrorOptions & {
			code: StateErrorCode;
			details?: Record<string, any>;
			errorURL?: string;
		},
	) {
		super(message, options);
		this.code = options.code;
		this.details = options.details;
		this.errorURL = options.errorURL;
	}
}

export async function generateGenericState(
	c: GenericEndpointContext,
	stateData: StateData,
	settings?: { cookieName: string },
) {
	const state = generateRandomString(32);
	const storeStateStrategy = c.context.oauthConfig.storeStateStrategy;

	// Cookie strategy:
	//
	// State data is encrypted into the cookie
	// no verification record created
	if (storeStateStrategy === "cookie") {
		const payload: StateData = { ...stateData, oauthState: state };

		const stateCookie = c.context.createAuthCookie(
			settings?.cookieName ?? "oauth_state",
			{
				maxAge: 10 * 60, // 10 minutes
			},
		);

		const pending = await readPendingStates(c, stateCookie.name);
		const nextStates = [
			...pending.filter((entry) => entry.expiresAt > Date.now()),
			payload,
		].slice(-MAX_PENDING_STATES);

		const encryptStates = async (states: StateData[]) =>
			symmetricEncrypt({
				key: c.context.secretConfig,
				data: JSON.stringify(states),
			});

		// Drop the oldest pending flows until the cookie fits. This flow is the one
		// the caller is about to be redirected into, so it is never dropped.
		let encryptedData = await encryptStates(nextStates);
		while (
			encryptedData.length > MAX_STATE_COOKIE_LENGTH &&
			nextStates.length > 1
		) {
			nextStates.shift();
			encryptedData = await encryptStates(nextStates);
		}

		// A single flow can still be too large on its own. Writing it keeps the
		// existing behaviour, but the browser will drop the cookie and the callback
		// will fail with `state_mismatch`, so say why here rather than there.
		if (encryptedData.length > MAX_STATE_COOKIE_LENGTH) {
			c.context.logger.warn(
				`OAuth state cookie is ${encryptedData.length} bytes, which most browsers will reject. Shorten callbackURL, errorCallbackURL or any additional state data.`,
			);
		}

		c.setCookie(stateCookie.name, encryptedData, stateCookie.attributes);

		return {
			state,
			codeVerifier: stateData.codeVerifier,
		};
	}

	// Database strategy:
	//
	// state is stored in a signed cookie and sent via OAuth URL
	// the adapter hashes it at rest when storeIdentifier is set
	const stateCookie = c.context.createAuthCookie(
		settings?.cookieName ?? "state",
		{
			maxAge: 5 * 60, // 5 minutes
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
		value: JSON.stringify({
			...stateData,
			oauthState: state,
		} satisfies StateData),
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

	// Return the plain state, not verification.identifier.
	// The adapter hashes it for DB storage when storeIdentifier is "hashed",
	// so returning verification.identifier would cause double-hashing on lookup.
	return {
		state,
		codeVerifier: stateData.codeVerifier,
	};
}

export async function parseGenericState(
	c: GenericEndpointContext,
	state: string | undefined,
	settings?: { cookieName?: string; skipStateCookieCheck?: boolean },
) {
	if (!state) {
		throw new StateError("State not found in OAuth callback", {
			code: "state_not_found",
		});
	}

	const storeStateStrategy = c.context.oauthConfig.storeStateStrategy;
	let parsedData: StateData;

	if (storeStateStrategy === "cookie") {
		// Retrieve state data from encrypted cookie. Carries write attributes so
		// the remaining flows can be stored back below.
		const stateCookie = c.context.createAuthCookie(
			settings?.cookieName ?? "oauth_state",
			{
				maxAge: 10 * 60, // 10 minutes
			},
		);
		const encryptedData = c.getCookie(stateCookie.name);

		if (!encryptedData) {
			throw new StateError("State mismatch: auth state cookie not found", {
				code: "state_mismatch",
				details: { state },
			});
		}

		let pendingStates: StateData[];
		try {
			const decryptedData = await symmetricDecrypt({
				key: c.context.secretConfig,
				data: encryptedData,
			});

			pendingStates = toPendingStates(JSON.parse(decryptedData));
		} catch (error) {
			throw new StateError(
				"State invalid: Failed to decrypt or parse auth state",
				{
					code: "state_invalid",
					details: { state },
					cause: error,
				},
			);
		}

		// Expired entries match here so the check below still reports them as
		// `state_mismatch` rather than as a security mismatch.
		const matchedState = pendingStates.find(
			(entry) => entry.oauthState === state,
		);

		if (!matchedState) {
			throw new StateError(
				"State mismatch: OAuth state parameter does not match stored state",
				{
					code: "state_security_mismatch",
					details: { state },
					// Origin-validated at sign-in, so the newest is a safe fallback.
					errorURL: pendingStates.at(-1)?.errorURL,
				},
			);
		}

		parsedData = matchedState;

		const remainingStates = pendingStates.filter(
			(entry) => entry.oauthState !== state && entry.expiresAt > Date.now(),
		);

		if (remainingStates.length === 0) {
			expireCookie(c, stateCookie);
		} else {
			c.setCookie(
				stateCookie.name,
				await symmetricEncrypt({
					key: c.context.secretConfig,
					data: JSON.stringify(remainingStates),
				}),
				stateCookie.attributes,
			);
		}
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

		if (
			parsedData.oauthState !== undefined &&
			parsedData.oauthState !== state
		) {
			throw new StateError(
				"State mismatch: OAuth state parameter does not match stored state",
				{
					code: "state_security_mismatch",
					details: { state },
					errorURL: parsedData.errorURL,
				},
			);
		}

		const stateCookie = c.context.createAuthCookie(
			settings?.cookieName ?? "state",
		);

		const stateCookieValue = await c.getSignedCookie(
			stateCookie.name,
			c.context.secret,
		);

		/**
		 * This is generally cause security issue and should only be used in
		 * dev or staging environments. It's currently used by the oauth-proxy
		 * plugin
		 *
		 * Also used by SAML relay state parsing via settings.skipStateCookieCheck,
		 * where the IdP POST is typically cross-origin and SameSite=Lax cookies
		 * are not sent.
		 */
		const skipStateCookieCheck =
			settings?.skipStateCookieCheck ??
			c.context.oauthConfig.skipStateCookieCheck;
		if (
			!skipStateCookieCheck &&
			(!stateCookieValue || stateCookieValue !== state)
		) {
			throw new StateError("State mismatch: State not persisted correctly", {
				code: "state_security_mismatch",
				details: { state },
				errorURL: parsedData.errorURL,
			});
		}

		expireCookie(c, stateCookie);

		// Delete verification value after retrieval
		await c.context.internalAdapter.deleteVerificationByIdentifier(state);
	}

	// Check expiration
	if (parsedData.expiresAt < Date.now()) {
		throw new StateError("Invalid state: request expired", {
			code: "state_mismatch",
			details: {
				expiresAt: parsedData.expiresAt,
			},
			errorURL: parsedData.errorURL,
		});
	}

	return parsedData;
}
