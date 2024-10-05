import { betterFetch } from "@better-fetch/fetch";
import { Spotify } from "arctic";
import type { OAuthProvider, ProviderOptions } from ".";
import { getRedirectURI, validateAuthorizationCode } from "./utils";

export interface SpotifyProfile {
	id: string;
	display_name: string;
	email: string;
	images: {
		url: string;
	}[];
}

export interface SpotifyOptions extends ProviderOptions {}

export const spotify = (options: SpotifyOptions) => {
	const spotifyArctic = new Spotify(
		options.clientId,
		options.clientSecret,
		getRedirectURI("spotify", options.redirectURI),
	);
	return {
		id: "spotify",
		name: "Spotify",
		createAuthorizationURL({ state, scopes }) {
			const _scopes = options.scope || scopes || ["user-read-email"];
			return spotifyArctic.createAuthorizationURL(state, _scopes);
		},
		validateAuthorizationCode: async (code, codeVerifier, redirectURI) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI:
					redirectURI || getRedirectURI("spotify", options.redirectURI),
				options,
				tokenEndpoint: "https://accounts.spotify.com/api/token",
			});
		},
		async getUserInfo(token) {
			const { data: profile, error } = await betterFetch<SpotifyProfile>(
				"https://api.spotify.com/v1/me",
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
					id: profile.id,
					name: profile.display_name,
					email: profile.email,
					image: profile.images[0]?.url,
					emailVerified: false,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<SpotifyProfile>;
};
