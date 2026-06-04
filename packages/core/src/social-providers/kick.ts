import { betterFetch } from "@better-fetch/fetch";
import type { ProviderOptions, UpstreamProvider } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	resolveRequestedScopes,
	validateAuthorizationCode,
} from "../oauth2";

export interface KickProfile {
	/**
	 * The user id of the user
	 */
	user_id: string;
	/**
	 * The name of the user
	 */
	name: string;
	/**
	 * The email of the user
	 */
	email: string;
	/**
	 * The picture of the user
	 */
	profile_picture: string;
}

export interface KickOptions extends ProviderOptions<KickProfile> {
	clientId: string;
}

const KICK_DEFAULT_SCOPES = ["user:read"];

export const kick = (options: KickOptions) => {
	return {
		id: "kick",
		name: "Kick",
		callbackPath: "/callback/kick",
		createAuthorizationURL({
			state,
			scopes,
			redirectURI,
			codeVerifier,
			additionalParams,
		}) {
			const requestedScopes = resolveRequestedScopes(
				options,
				KICK_DEFAULT_SCOPES,
				scopes,
			);
			return createAuthorizationURL({
				id: "kick",
				redirectURI,
				options,
				authorizationEndpoint: "https://id.kick.com/oauth/authorize",
				scopes: requestedScopes,
				codeVerifier,
				state,
				additionalParams,
			});
		},
		async validateAuthorizationCode({ code, redirectURI, codeVerifier }) {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://id.kick.com/oauth/token",
				codeVerifier,
			});
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientSecret: options.clientSecret,
						},
						tokenEndpoint: "https://id.kick.com/oauth/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const { data, error } = await betterFetch<{
				data: KickProfile[];
			}>("https://api.kick.com/public/v1/users", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${token.accessToken}`,
				},
			});

			if (error) {
				return null;
			}

			const profile = data.data[0]!;

			const userMap = await options.mapProfileToUser?.(profile);
			// Kick does not provide email_verified claim.
			// We default to false for security consistency.
			return {
				user: {
					id: profile.user_id,
					name: profile.name,
					email: profile.email,
					image: profile.profile_picture,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies UpstreamProvider<KickProfile>;
};
