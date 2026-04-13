import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface OktaOptions extends BaseOAuthProviderOptions {
	/**
	 * Okta issuer URL (e.g., https://dev-xxxxx.okta.com/oauth2/default)
	 * This will be used to construct the discovery URL.
	 */
	issuer: string;
}

/**
 * Okta OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, okta } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         okta({
 *           clientId: process.env.OKTA_CLIENT_ID,
 *           clientSecret: process.env.OKTA_CLIENT_SECRET,
 *           issuer: process.env.OKTA_ISSUER,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function okta(options: OktaOptions): GenericOAuthConfig<"okta"> {
	const defaultScopes = ["openid", "profile", "email"];

	// Ensure issuer ends without trailing slash for proper discovery URL construction
	const issuer = options.issuer.replace(/\/$/, "");
	const discoveryUrl = `${issuer}/.well-known/openid-configuration`;

	return {
		providerId: "okta",
		discoveryUrl,
		clientId: options.clientId,
		clientSecret: options.clientSecret,
		scopes: options.scopes ?? defaultScopes,
		redirectURI: options.redirectURI,
		pkce: options.pkce,
		disableImplicitSignUp: options.disableImplicitSignUp,
		disableSignUp: options.disableSignUp,
		overrideUserInfo: options.overrideUserInfo,
	};
}
