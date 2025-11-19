import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { GenericOAuthConfig } from "../index";

/**
 * Provider definition based on Auth.js/NextAuth.js
 * Source: https://github.com/nextauthjs/next-auth
 * Adapted for Better Auth's GenericOAuthConfig format
 */

export interface MicrosoftEntraIdOptions {
	/** Microsoft Entra ID (Azure AD) application (client) ID */
	clientId: string;
	/** Microsoft Entra ID (Azure AD) client secret */
	clientSecret: string;
	/**
	 * Microsoft Entra ID tenant ID.
	 * Can be a GUID, "common", "organizations", or "consumers"
	 */
	tenantId: string;
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
	 * Whether to use PKCE (Proof Key for Code Exchange)
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

interface MicrosoftEntraIdProfile {
	sub: string;
	name?: string;
	email?: string;
	preferred_username?: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
	email_verified?: boolean;
}

/**
 * Microsoft Entra ID (Azure AD) OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, microsoftEntraId } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         microsoftEntraId({
 *           clientId: process.env.MS_APP_ID,
 *           clientSecret: process.env.MS_CLIENT_SECRET,
 *           tenantId: process.env.MS_TENANT_ID,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function microsoftEntraId(
	options: MicrosoftEntraIdOptions,
): GenericOAuthConfig {
	const defaultScopes = ["openid", "profile", "email"];

	const tenantId = options.tenantId;
	const authorizationUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
	const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
	const userInfoUrl = "https://graph.microsoft.com/oidc/userinfo";

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const { data: profile, error } = await betterFetch<MicrosoftEntraIdProfile>(
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
			name: profile.name ?? (`${profile.given_name ?? ""} ${profile.family_name ?? ""}`.trim() || undefined),
			email: profile.email ?? profile.preferred_username ?? undefined,
			image: profile.picture,
			// Note: Microsoft Entra ID does NOT include email_verified claim by default.
			// It must be configured as an optional claim in the app registration.
			// We default to false when not provided 
			// The built-in provider hardcodes this to true, assuming Microsoft accounts are verified.
			emailVerified: profile.email_verified ?? false,
		};
	};

	return {
		providerId: "microsoft-entra-id",
		authorizationUrl,
		tokenUrl,
		userInfoUrl,
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

