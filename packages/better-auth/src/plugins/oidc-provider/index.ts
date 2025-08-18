import { makeOIDCPlugin } from "../oidc";

/**
 * OpenID Connect (OIDC) plugin for Better Auth. This plugin implements the
 * authorization code flow and the token exchange flow. It also implements the
 * userinfo endpoint.
 *
 * @param options - The options for the OIDC plugin.
 * @returns A Better Auth plugin.
 */
export const oidcProvider = makeOIDCPlugin({
	id: "oidc",
	pathPrefix: "oauth2",
	disableCors: false,
	alwaysSkipConsent: false,
});

export type * from "../oidc/types";
