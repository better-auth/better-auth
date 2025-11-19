import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { GenericOAuthConfig } from "../index";

/**
 * Provider definition based on Auth.js/NextAuth.js
 * Source: https://github.com/nextauthjs/next-auth
 * Adapted for Better Auth's GenericOAuthConfig format
 */

export interface OktaOptions {
	/** Okta OAuth client ID */
	clientId: string;
	/** Okta OAuth client secret */
	clientSecret: string;
	/**
	 * Okta issuer URL (e.g., https://dev-xxxxx.okta.com/oauth2/default)
	 * This will be used to construct the discovery URL.
	 */
	issuer: string;
	/**
	 * Array of OAuth scopes to request.
	 * @default ["openid", "profile", "email"]
	 */
	scopes?: string[];
	/**
	 * Custom redirect URI.
	 * If not provided, a default URI will be constructed.
	 */
	redirectURI?: string;
	/**
	 * Whether to use PKCE
	 * @default false
	 */
	pkce?: boolean;
	/**
	 * Disable implicit sign up for new users.
	 */
	disableImplicitSignUp?: boolean;
	/**
	 * Disable sign up for new users.
	 */
	disableSignUp?: boolean;
	/**
	 * Override user info with the provider info on sign in.
	 */
	overrideUserInfo?: boolean;
}

interface OktaProfile {
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
export function okta(options: OktaOptions): GenericOAuthConfig {
	const defaultScopes = ["openid", "profile", "email"];

	// Ensure issuer ends without trailing slash for proper discovery URL construction
	const issuer = options.issuer.replace(/\/$/, "");
	const discoveryUrl = `${issuer}/.well-known/openid-configuration`;

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const userInfoUrl = `${issuer}/v1/userinfo`;

		const { data: profile, error } = await betterFetch<OktaProfile>(
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
			emailVerified: profile.email_verified ?? false,
		};
	};

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
		getUserInfo,
	};
}

