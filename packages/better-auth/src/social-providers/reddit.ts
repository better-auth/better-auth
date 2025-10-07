import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	getOAuth2Tokens,
	refreshAccessToken,
} from "@better-auth/core/oauth2";
import { base64 } from "@better-auth/utils/base64";

export interface RedditProfile {
	id: string;
	name: string;
	icon_img: string | null;
	has_verified_email: boolean;
	oauth_client_id: string;
	verified: boolean;
}

export interface RedditOptions extends ProviderOptions<RedditProfile> {
	clientId: string;
	duration?: string;
}

export const reddit = (options: RedditOptions) => {
	return {
		id: "reddit",
		name: "Reddit",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["identity"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "reddit",
				options,
				authorizationEndpoint: "https://www.reddit.com/api/v1/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				duration: options.duration,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			const body = new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: options.redirectURI || redirectURI,
			});
			const headers = {
				"content-type": "application/x-www-form-urlencoded",
				accept: "text/plain",
				"user-agent": "better-auth",
				Authorization: `Basic ${base64.encode(
					`${options.clientId}:${options.clientSecret}`,
				)}`,
			};

			const { data, error } = await betterFetch<object>(
				"https://www.reddit.com/api/v1/access_token",
				{
					method: "POST",
					headers,
					body: body.toString(),
				},
			);

			if (error) {
				throw error;
			}

			return getOAuth2Tokens(data);
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
						authentication: "basic",
						tokenEndpoint: "https://www.reddit.com/api/v1/access_token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const { data: profile, error } = await betterFetch<RedditProfile>(
				"https://oauth.reddit.com/api/v1/me",
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
						"User-Agent": "better-auth",
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
					name: profile.name,
					email: profile.oauth_client_id,
					emailVerified: profile.has_verified_email,
					image: profile.icon_img?.split("?")[0]!,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<RedditProfile>;
};
