import { decodeJwt } from "jose";
import { logger } from "../env";
import type { ProviderOptions, UpstreamProvider } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	resolveRequestedScopes,
	validateAuthorizationCode,
} from "../oauth2";

/**
 * @see https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/#requesting-claims
 */
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
	 * Indicate if this user has a verified email.
	 */
	email_verified: boolean;
	/**
	 * The picture of the user
	 */
	picture: string;
}

export interface TwitchOptions extends ProviderOptions<TwitchProfile> {
	clientId: string;
	claims?: string[] | undefined;
}
const TWITCH_DEFAULT_SCOPES = ["user:read:email", "openid"];

export const twitch = (options: TwitchOptions) => {
	const tokenEndpoint = "https://id.twitch.tv/oauth2/token";
	return {
		id: "twitch",
		name: "Twitch",
		callbackPath: "/callback/twitch",
		createAuthorizationURL({ state, scopes, redirectURI, additionalParams }) {
			const requestedScopes = resolveRequestedScopes(
				options,
				TWITCH_DEFAULT_SCOPES,
				scopes,
			);
			return createAuthorizationURL({
				id: "twitch",
				redirectURI,
				options,
				authorizationEndpoint: "https://id.twitch.tv/oauth2/authorize",
				scopes: requestedScopes,
				state,
				claims: options.claims || [
					"email",
					"email_verified",
					"preferred_username",
					"picture",
				],
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
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
					emailVerified: profile.email_verified,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies UpstreamProvider<TwitchProfile>;
};
