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
export function auth0(options: Auth0Options): GenericOAuthConfig<"auth0"> {
	const defaultScopes = ["openid", "profile", "email"];

	const domainUrl =
		options.domain.startsWith("http://") ||
		options.domain.startsWith("https://")
			? options.domain
			: `https://${options.domain}`;
	const domain = new URL(domainUrl).host;
	const discoveryUrl = `https://${domain}/.well-known/openid-configuration`;

	return {
		providerId: "auth0",
		discoveryUrl,
		clientId: options.clientId,
		clientSecret: options.clientSecret,
		tokenEndpointAuth: options.tokenEndpointAuth,
		scopes: options.scopes ?? defaultScopes,
		redirectURI: options.redirectURI,
		endSessionEndpoint: options.endSessionEndpoint,
		postLogoutRedirectURI: options.postLogoutRedirectURI,
		disableProviderLogout: options.disableProviderLogout,
		pkce: options.pkce,
		disableImplicitSignUp: options.disableImplicitSignUp,
		disableSignUp: options.disableSignUp,
		overrideUserInfo: options.overrideUserInfo,
	};
}
