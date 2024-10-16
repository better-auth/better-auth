import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	getRedirectURI,
	validateAuthorizationCode,
} from "../oauth2";
import { logger } from "../utils";
import { parseJWT } from "oslo/jwt";

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
		createAuthorizationURL({ state, scopes }) {
			const _scopes = options.scope || scopes || ["user:read:email", "openid"];
			return createAuthorizationURL({
				id: "twitch",
				options,
				authorizationEndpoint: "https://id.twitch.tv/oauth2/authorize",
				scopes: _scopes,
				state,
				claims: options.claims || [
					"email",
					"email_verified",
					"preferred_username",
				],
			});
		},
		validateAuthorizationCode: async (code, _, redirectURI) => {
			return validateAuthorizationCode({
				code,
				redirectURI:
					redirectURI || getRedirectURI("twitch", options.redirectURI),
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
