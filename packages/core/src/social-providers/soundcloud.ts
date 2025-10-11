import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";

export interface SoundCloudProfile {
	/** The user id */
	id: number | string;
	/** The username */
	username: string;
	/** The full display name */
	full_name: string;
	/** Avatar image */
	avatar_url: string;
	/** Email is not available for SoundCloud */
	email?: never;
}

export interface SoundCloudOptions extends ProviderOptions<SoundCloudProfile> {}

export const soundcloud = (options: SoundCloudOptions) => {
	const authorizationEndpoint = "https://secure.soundcloud.com/authorize";
	const tokenEndpoint = "https://secure.soundcloud.com/oauth/token";
	return {
		id: "soundcloud",
		name: "SoundCloud",
		async createAuthorizationURL({ state, codeVerifier, redirectURI }) {
			// SoundCloud does not implement granular scopes; the token returned is always full-access.
			return await createAuthorizationURL({
				id: "soundcloud",
				options,
				authorizationEndpoint,
				scopes: [], // scope param will be empty
				state,
				redirectURI,
				codeVerifier,
			});
		},
		async validateAuthorizationCode({ code, codeVerifier, redirectURI }) {
			return await validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint,
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) =>
					refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientKey: options.clientKey,
							clientSecret: options.clientSecret,
						},
						tokenEndpoint,
					}),
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<SoundCloudProfile>(
				"https://api.soundcloud.com/me",
				{
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
					id: profile.id.toString(),
					name: profile.full_name || profile.username,
					// @note SoundCloud does not provide email addresses, so this becomes username@soundcloud
					email: profile.username + "@soundcloud",
					image: profile.avatar_url,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<SoundCloudProfile>;
};
