import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	getOAuth2Tokens,
	validateAuthorizationCode,
} from "../oauth2";

export interface RedditProfile {
	id: string;
	name: string;
	icon_img: string | null;
	has_verified_email: boolean;
	oauth_client_id: string;
	verified: boolean;
}

export interface RedditOptions extends ProviderOptions<RedditProfile> {
	duration?: string;
}

export const reddit = (options: RedditOptions) => {
	return {
		id: "reddit",
		name: "Reddit",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = scopes || ["identity"];
			options.scope && _scopes.push(...options.scope);

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
				Authorization: `Basic ${Buffer.from(
					`${options.clientId}:${options.clientSecret}`,
				).toString("base64")}`,
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
					image: profile.icon_img?.split("?")[0],
					...userMap,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<RedditProfile>;
};
