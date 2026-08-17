import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface ThunderIDOptions extends BaseOAuthProviderOptions {
	/**
	 * ThunderID issuer URL (e.g., https://thunderid.example.com)
	 * This will be used to construct the discovery URL.
	 */
	issuer: string;
}

/**
 * ThunderID OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, thunderid } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         thunderid({
 *           clientId: process.env.THUNDERID_CLIENT_ID,
 *           clientSecret: process.env.THUNDERID_CLIENT_SECRET,
 *           issuer: process.env.THUNDERID_ISSUER,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function thunderid(options: ThunderIDOptions): GenericOAuthConfig {
	const defaultScopes = ["openid", "profile", "email"];

	// Ensure issuer ends without trailing slash for proper discovery URL construction
	const issuer = options.issuer.replace(/\/$/, "");
	const discoveryUrl = `${issuer}/.well-known/openid-configuration`;

	return {
		providerId: "thunderid",
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
