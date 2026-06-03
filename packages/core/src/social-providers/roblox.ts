import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface RobloxProfile extends Record<string, any> {
	/** the user's id */
	sub: string;
	/** the user's username */
	preferred_username: string;
	/** the user's display name, will return the same value as the preferred_username if not set */
	nickname: string;
	/** the user's display name, again, will return the same value as the preferred_username if not set */
	name: string;
	/** the account creation date as a unix timestamp in seconds */
	created_at: number;
	/** the user's profile URL */
	profile: string;
	/** the user's avatar URL */
	picture: string;
}

export interface RobloxOptions extends ProviderOptions<RobloxProfile> {
	clientId: string;
	prompt?:
		| (
				| "none"
				| "consent"
				| "login"
				| "select_account"
				| "select_account consent"
		  )
		| undefined;
}

export const roblox = (options: RobloxOptions) => {
	const tokenEndpoint = "https://apis.roblox.com/oauth/v1/token";
	return {
		id: "roblox",
		name: "Roblox",
		createAuthorizationURL({ state, scopes, redirectURI, additionalParams }) {
			const _scopes = options.disableDefaultScope ? [] : ["openid", "profile"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "roblox",
				options,
				authorizationEndpoint: "https://apis.roblox.com/oauth/v1/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				prompt: options.prompt || "select_account consent",
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint,
				authentication: "post",
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientKey: options.clientKey,
							clientSecret: options.clientSecret,
						},
						tokenEndpoint,
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

			const userMap = await options.mapProfileToUser?.(profile);
			// Roblox does not provide email or email_verified claim.
			// We default to false for security consistency.
			return {
				user: {
					id: profile.sub,
					name: profile.nickname || profile.preferred_username || "",
					image: profile.picture,
					email: profile.preferred_username || null, // Roblox does not provide email
					emailVerified: false,
					...userMap,
				},
				data: {
					...profile,
				},
			};
		},
		options,
	} satisfies OAuthProvider<RobloxProfile>;
};
