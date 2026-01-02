import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { BaseOAuthProviderOptions, GenericOAuthConfig } from "../index";

export interface GumroadOptions extends BaseOAuthProviderOptions {}

interface GumroadUser {
	user_id: string;
	name: string;
	email: string;
	profile_url: string;
}

interface GumroadProfile {
	success: boolean;
	user: GumroadUser;
}

/**
 * Gumroad OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, gumroad } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         gumroad({
 *           clientId: process.env.GUMROAD_CLIENT_ID,
 *           clientSecret: process.env.GUMROAD_CLIENT_SECRET,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 *
 * @see https://app.gumroad.com/oauth
 */
export function gumroad(options: GumroadOptions): GenericOAuthConfig {
	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const { data: profile, error } = await betterFetch<GumroadProfile>(
			"https://api.gumroad.com/v2/user",
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile?.success || !profile.user) {
			return null;
		}

		return {
			id: profile.user.user_id,
			name: profile.user.name,
			email: profile.user.email,
			image: profile.user.profile_url,
			emailVerified: false,
		};
	};

	const defaultScopes = ["view_profile"];

	return {
		providerId: "gumroad",
		authorizationUrl: "https://gumroad.com/oauth/authorize",
		tokenUrl: "https://api.gumroad.com/oauth/token",
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


