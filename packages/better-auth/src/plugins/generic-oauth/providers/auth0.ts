import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface Auth0Options extends BaseOAuthProviderOptions {
	/**
	 * Auth0 domain (e.g., dev-xxx.eu.auth0.com)
	 * This will be used to construct the discovery URL.
	 */
	domain: string;
}

/**
 * Auth0 OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, auth0 } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         auth0({
 *           clientId: process.env.AUTH0_CLIENT_ID,
 *           clientSecret: process.env.AUTH0_CLIENT_SECRET,
 *           domain: process.env.AUTH0_DOMAIN,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function auth0(options: Auth0Options): GenericOAuthConfig {
	const defaultScopes = ["openid", "profile", "email"];

	// Ensure domain doesn't have protocol prefix
	const domain = options.domain.replace(/^https?:\/\//, "");
	const discoveryUrl = `https://${domain}/.well-known/openid-configuration`;

	return {
		providerId: "auth0",
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
