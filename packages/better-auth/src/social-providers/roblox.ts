import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { validateAuthorizationCode } from "../oauth2";

export interface RobloxProfile extends Record<string, any> {
	/** the user's id */
	sub: string;
	/** the user's username */
	preferred_username: string;
	/** the user's display name, will return the same value as the preffered_username if not set */
	nickname: string;
	/** the user's display name, again, will return the same value as the preffered_username if not set */
	name: string;
	/** the account creation date as a unix timestamp in seconds */
	created_at: number;
	/** the user's profile url */
	profile: string;
	/** the user's avatar url */
	picture: string;
}

export interface RobloxOptions extends ProviderOptions<RobloxProfile> {
	prompt?: "none" | "consent" | 'login' | 'select_account' | 'select_account+consent';
}

export const roblox = (options: RobloxOptions) => {
	return {
		id: "roblox",
		name: "Roblox",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = scopes || ["openid", "profile"];
			options.scope && _scopes.push(...options.scope);
			return new URL(
				`https://apis.roblox.com/oauth/v1/authorize?scope=${_scopes.join(
					"+",
				)}&response_type=code&client_id=${
					options.clientId
				}&redirect_uri=${encodeURIComponent(
					options.redirectURI || redirectURI,
				)}&state=${state}&prompt=${options.prompt || "select_account+consent"}`,
			);
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint: "https://apis.roblox.com/oauth/v1/token",
				authentication: "post",
			});
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<RobloxProfile>(
				"https://apis.roblox.com/oauth/v1/userinfo",
				{
					headers: {
						authorization: `Bearer ${token.accessToken}`,
					},
				},
			);

			if (error) {
				return null;
			}
			return {
				user: {
					id: profile.sub,
					name: profile.nickname || profile.preferred_username || "",
					image: profile.picture,
					email: profile.preferred_username || null, // Roblox does not provide email
					emailVerified: true,
				},
				data: {
					...profile,
				},
			};
		},
	} satisfies OAuthProvider<RobloxProfile>;
};
