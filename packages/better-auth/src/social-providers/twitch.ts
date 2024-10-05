import { betterFetch } from "@better-fetch/fetch";
import { Twitch } from "arctic";
import type { OAuthProvider, ProviderOptions } from ".";
import { getRedirectURI, validateAuthorizationCode } from "./utils";

export interface TwitchProfile {
	/**
	 * The sub of the user
	 */
	sub: string;
	/**
	 * The preferred username of the user
	 */
	preferred_username: string;
	/**
	 * The email of the user
	 */
	email: string;
	/**
	 * The picture of the user
	 */
	picture: string;
}

export interface TwitchOptions extends ProviderOptions {}
export const twitch = (options: TwitchOptions) => {
	const twitchArctic = new Twitch(
		options.clientId,
		options.clientSecret,
		getRedirectURI("twitch", options.redirectURI),
	);
	return {
		id: "twitch",
		name: "Twitch",
		createAuthorizationURL({ state, scopes }) {
			const _scopes = options.scope || scopes || ["activity:write", "read"];
			return twitchArctic.createAuthorizationURL(state, _scopes);
		},
		validateAuthorizationCode: async (code, codeVerifier, redirectURI) => {
			return validateAuthorizationCode({
				code,
				redirectURI:
					redirectURI || getRedirectURI("twitch", options.redirectURI),
				options,
				tokenEndpoint: "https://id.twitch.tv/oauth2/token",
			});
		},
		async getUserInfo(token) {
			const { data: profile, error } = await betterFetch<TwitchProfile>(
				"https://api.twitch.tv/helix/users",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.accessToken()}`,
					},
				},
			);
			if (error) {
				return null;
			}
			return {
				user: {
					id: profile.sub,
					name: profile.preferred_username,
					email: profile.email,
					image: profile.picture,
					emailVerified: false,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<TwitchProfile>;
};
