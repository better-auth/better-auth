import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface MicrosoftEntraIdOptions extends BaseOAuthProviderOptions {
	/**
	 * Microsoft Entra ID tenant ID.
	 * Can be a GUID, "common", "organizations", or "consumers"
	 */
	tenantId: string;
}

interface MicrosoftEntraIdProfile {
	sub: string;
	name?: string;
	email?: string;
	preferred_username?: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
	/** Personal Microsoft accounts may return `givenname` (no underscore) */
	givenname?: string;
	/** Personal Microsoft accounts may return `familyname` (no underscore) */
	familyname?: string;
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

		// Personal Microsoft accounts may return `givenname`/`familyname` (no underscore)
		// instead of `given_name`/`family_name`. We handle both variants.
		const givenName = profile.given_name ?? profile.givenname;
		const familyName = profile.family_name ?? profile.familyname;
		const resolvedName =
			profile.name ??
			([givenName, familyName].filter(Boolean).join(" ") || undefined);

		return {
			id: profile.sub,
			name:
				resolvedName ??
				profile.email ??
				profile.preferred_username ??
				undefined,
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
