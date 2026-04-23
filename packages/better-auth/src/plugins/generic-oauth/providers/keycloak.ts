import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index.js";

export interface KeycloakOptions extends BaseOAuthProviderOptions {
	/**
	 * Keycloak issuer URL (includes realm, e.g., https://my-domain/realms/MyRealm)
	 * This will be used to construct the discovery URL.
	 */
	issuer: string;
}

/**
 * Keycloak OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, keycloak } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         keycloak({
 *           clientId: process.env.KEYCLOAK_CLIENT_ID,
 *           clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
 *           issuer: process.env.KEYCLOAK_ISSUER,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function keycloak(options: KeycloakOptions): GenericOAuthConfig {
	const defaultScopes = ["openid", "profile", "email"];

	// Ensure issuer ends without trailing slash for proper discovery URL construction
	const issuer = options.issuer.replace(/\/$/, "");
	const discoveryUrl = `${issuer}/.well-known/openid-configuration`;

	return {
		providerId: "keycloak",
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
