import { betterFetch } from "@better-fetch/fetch";
import { Spotify } from "arctic";
import type { OAuthProvider } from ".";
import { getRedirectURI } from "./utils";

export interface SpotifyProfile {
	id: string;
	display_name: string;
	email: string;
	images: {
		url: string;
	}[];
}

export interface SpotifyOptions {
	clientId: string;
	clientSecret: string;
	redirectURI?: string;
}

export const spotify = ({
	clientId,
	clientSecret,
	redirectURI,
}: SpotifyOptions) => {
	const spotifyArctic = new Spotify(
		clientId,
		clientSecret,
		getRedirectURI("spotify", redirectURI),
	);
	return {
		id: "spotify",
		name: "Spotify",
		createAuthorizationURL({ state, scopes }) {
			const _scopes = scopes || ["user-read-email"];
			return spotifyArctic.createAuthorizationURL(state, _scopes);
		},
		validateAuthorizationCode: spotifyArctic.validateAuthorizationCode,
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
