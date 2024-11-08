import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { logger } from "../utils";
import { parseJWT } from "oslo/jwt";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

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

export interface TwitchOptions extends ProviderOptions {
	claims?: string[];
}
export const twitch = (options: TwitchOptions) => {
	return {
		id: "twitch",
		name: "Twitch",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = scopes || ["user:read:email", "openid"];
			options.scope && _scopes.push(...options.scope);
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
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint: "https://id.twitch.tv/oauth2/token",
			});
		},
		async getUserInfo(token) {
			const idToken = token.idToken;
			if (!idToken) {
				logger.error("No idToken found in token");
				return null;
			}
			const profile = parseJWT(idToken)?.payload as TwitchProfile;
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
