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
	[key: string]: any;
};

const oauthRequestState = defineRequestState<OAuthState | null>(() => null);

/**
 * Returns the OAuth state object for the active request, or `null` when no
 * OAuth flow is in progress.
 *
 * Pass an optional generic parameter `T` to extend the returned shape with the
 * fields that callers previously merged in via `setOAuthState` (or via
 * `signIn.social({ additionalData })`). This matches the documented usage
 * pattern `getOAuthState<{ callbackURL: string }>()` and lets the additional
 * data type-check without falling back to the loose `[key: string]: any`
 * index signature. See https://github.com/better-auth/better-auth/issues/9795.
 *
 * @example
 * const state = await getOAuthState<{ tenantId: string }>();
 * if (state) {
 *   const tenantId: string = state.tenantId;
 * }
 */
function getOAuthState<
	T extends Record<string, unknown> = Record<string, never>,
>(): Promise<(OAuthState & T) | null> {
	return oauthRequestState.get() as Promise<(OAuthState & T) | null>;
}

/**
 * @internal This is unsafe to be used directly. Use setOAuthState via the
 * normal sign-in flow instead.
 */
const setOAuthState = oauthRequestState.set;

export { getOAuthState, setOAuthState };
