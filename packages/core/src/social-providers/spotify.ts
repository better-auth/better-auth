import { betterFetch } from "@better-fetch/fetch";
import type { ProviderOptions, UpstreamProvider } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	resolveRequestedScopes,
	validateAuthorizationCode,
} from "../oauth2";

export interface SpotifyProfile {
	id: string;
	display_name: string;
	email: string;
	images: {
		url: string;
	}[];
}

export interface SpotifyOptions extends ProviderOptions<SpotifyProfile> {
	clientId: string;
}

const SPOTIFY_DEFAULT_SCOPES = ["user-read-email"];

export const spotify = (options: SpotifyOptions) => {
	const tokenEndpoint = "https://accounts.spotify.com/api/token";
	return {
		id: "spotify",
		name: "Spotify",
		callbackPath: "/callback/spotify",
		async createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			additionalParams,
		}) {
			const requestedScopes = resolveRequestedScopes(
				options,
				SPOTIFY_DEFAULT_SCOPES,
				scopes,
			);
			return createAuthorizationURL({
				id: "spotify",
				options,
				authorizationEndpoint: "https://accounts.spotify.com/authorize",
				scopes: requestedScopes,
				state,
				codeVerifier,
				redirectURI,
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
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
			const { data: profile, error } = await betterFetch<SpotifyProfile>(
				"https://api.spotify.com/v1/me",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
				},
			);
			if (error) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.display_name,
					email: profile.email,
					image: profile.images[0]?.url,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies UpstreamProvider<SpotifyProfile>;
};
