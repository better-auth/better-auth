import { betterFetch } from "@better-fetch/fetch";
import { decodeJwt } from "jose";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
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
	preferred_username?: string;
	/**
	 * The email of the user
	 */
	email?: string | null;
	/**
	 * Indicate if this user has a verified email.
	 */
	email_verified: boolean;
	/**
	 * The picture of the user
	 */
	picture?: string;
}

export interface TwitchOptions extends ProviderOptions<TwitchProfile> {
	clientId: string;
	claims?: string[] | undefined;
}
/**
 * @see https://dev.twitch.tv/docs/api/reference/#get-users
 */
interface TwitchUser {
	id: string;
	display_name: string;
	email?: string;
	profile_image_url: string;
}

export const twitch = (options: TwitchOptions) => {
	const tokenEndpoint = "https://id.twitch.tv/oauth2/token";
	return {
		id: "twitch",
		name: "Twitch",
		accountSubject: ({ profile }) => profile.sub,
		createAuthorizationURL({ state, scopes, redirectURI, additionalParams }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["user:read:email", "openid"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
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
			if (!token.accessToken) {
				return null;
			}
			const { data } = await betterFetch<{ data: TwitchUser[] }>(
				"https://api.twitch.tv/helix/users",
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
						"Client-Id": options.clientId,
					},
				},
			);
			const user = data?.data?.[0];
			if (typeof user?.id !== "string" || !user.id) {
				return null;
			}
			// Keep the fetched account bound to a supplied ID token.
			if (token.idToken) {
				try {
					if (decodeJwt(token.idToken).sub !== user.id) return null;
				} catch {
					return null;
				}
			}

			const profile: TwitchProfile = {
				sub: user.id,
				preferred_username: user.display_name,
				email: user.email,
				// Get Users returns only verified email addresses.
				email_verified: !!user.email,
				picture: user.profile_image_url,
			};
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
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
	} satisfies OAuthProvider<TwitchProfile>;
};
