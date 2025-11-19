import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface KeycloakOptions extends BaseOAuthProviderOptions {
	/**
	 * Keycloak issuer URL (includes realm, e.g., https://my-domain/realms/MyRealm)
	 * This will be used to construct the discovery URL.
	 */
	issuer: string;
}

interface KeycloakProfile {
	sub: string;
	name?: string;
	email?: string;
	email_verified?: boolean;
	picture?: string;
	preferred_username?: string;
	given_name?: string;
	family_name?: string;
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

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		// Construct userinfo URL from issuer
		const userInfoUrl = `${issuer}/protocol/openid-connect/userinfo`;

		const { data: profile, error } = await betterFetch<KeycloakProfile>(
			userInfoUrl,
			{
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile) {
			return null;
		}

		return {
			id: profile.sub,
			name: profile.name ?? profile.preferred_username ?? undefined,
			email: profile.email ?? undefined,
			image: profile.picture,
			// Keycloak provides email_verified per OIDC standard, but availability depends on configuration.
			// We default to false when not provided or not configured.
			emailVerified: profile.email_verified ?? false,
		};
	};

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
		getUserInfo,
	};
}
