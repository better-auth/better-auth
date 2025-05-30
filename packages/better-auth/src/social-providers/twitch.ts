import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { logger } from "../utils";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
	refreshAccessToken,
} from "../oauth2";
import { decodeJwt } from "jose";

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

export interface TwitchOptions extends ProviderOptions<TwitchProfile> {
	claims?: string[];
}
export const twitch = (options: TwitchOptions) => {
	return {
		id: "twitch",
		name: "Twitch",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["user:read:email", "openid"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "twitch",
				redirectURI,
				options,
				authorizationEndpoint: "https://id.twitch.tv/oauth2/authorize",
				scopes: _scopes,
				state,
				claims: options.claims || [
					"email",
					"email_verified",
					"preferred_username",
					"picture",
				],
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://id.twitch.tv/oauth2/token",
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
						tokenEndpoint: "https://id.twitch.tv/oauth2/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const idToken = token.idToken;
			if (!idToken) {
				logger.error("No idToken found in token");
				return null;
			}
			const profile = decodeJwt(idToken) as TwitchProfile;
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.sub,
					name: profile.preferred_username,
					email: profile.email,
					image: profile.picture,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<TwitchProfile>;
};
