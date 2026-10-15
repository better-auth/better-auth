import { defineRequestState } from "@better-auth/core/context";

type OAuthState = {
	callbackURL: string;
	codeVerifier: string;
	errorURL?: string;
	newUserURL?: string;
	link?: {
		email: string;
		userId: string;
	};
	expiresAt: number;
	requestSignUp?: boolean;
	/**
	 * Server-controlled values that ride the OAuth state across the provider
	 * redirect. Nothing here is reachable from the request body: plugins write it
	 * with `addOAuthServerContext` and read it back on the callback. Use this for
	 * data the server must trust (identity, flow continuation), unlike the
	 * top-level `additionalData` keys below.
	 */
	serverContext?: Record<string, unknown>;
	/**
	 * Client-supplied `additionalData` is spread onto the top level. Treat every
	 * key here as untrusted input: it originates from the request body.
	 */
	[key: string]: any;
};

const { get: getRawOAuthState, set: setOAuthState } =
	defineRequestState<OAuthState | null>(() => null);

/**
 * Reads the OAuth state for the current request. During a callback it holds the
 * state parsed from the provider redirect; during sign-in it holds the state
 * just generated.
 *
 * Top-level keys beyond the documented fields are client-supplied
 * (`additionalData`) and must not be trusted. Server-trusted values live under
 * {@link OAuthState.serverContext}.
 */
const getOAuthState = async <
	T extends Record<string, unknown> = Record<string, unknown>,
>(): Promise<(OAuthState & T) | null> => {
	return (await getRawOAuthState()) as (OAuthState & T) | null;
};

/**
 * @internal Read accumulated server context to embed during state generation.
 */
const { get: getOAuthServerContext, set: setOAuthServerContext } =
	defineRequestState<Record<string, unknown> | null>(() => null);

/**
 * Attaches server-trusted data to the current OAuth flow so it survives the
 * provider redirect. Call this from a `before` hook on an OAuth sign-in path
 * (for example `/sign-in/social` or `/sign-in/oauth2`). `generateState` embeds
 * the accumulated values into the state, and they become readable on the
 * callback via `getOAuthState().serverContext`.
 *
 * Unlike the request body's `additionalData`, values set here cannot be spoofed
 * by the client. Multiple callers merge: each call adds its own keys. Values are
 * stored as `unknown`, so narrow their shape when reading them back.
 */
const addOAuthServerContext = async (
	values: Record<string, unknown>,
): Promise<void> => {
	const current = await getOAuthServerContext();
	await setOAuthServerContext({ ...(current ?? {}), ...values });
};

export {
	addOAuthServerContext,
	getOAuthServerContext,
	getOAuthState,
	setOAuthState,
};
