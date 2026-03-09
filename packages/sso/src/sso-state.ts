import { defineRequestState } from "@better-auth/core/context";

const { get: _getSSOState, set: setSSOState } = defineRequestState<
	Record<string, unknown> | undefined
>(() => undefined);

/**
 * Returns the `additionalData` passed by the client at SSO sign-in time.
 * Available in server-side hooks during both OIDC and SAML SSO callbacks.
 * Returns `undefined` outside of an SSO callback request.
 *
 * @example
 * const data = await getSSOState<{ referralCode?: string }>();
 */
async function getSSOState<
	T extends Record<string, unknown> = Record<string, unknown>,
>(): Promise<T | undefined> {
	return _getSSOState() as Promise<T | undefined>;
}

export { getSSOState, setSSOState };
