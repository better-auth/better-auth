import { betterFetch } from "@better-fetch/fetch";
import type {
	OAuthProvider,
	ProviderOptions,
	TokenEndpointAuth,
} from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";
import { createPlaceholderEmail } from "../utils/email";

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
	duration?: string | undefined;
}

export const reddit = (options: RedditOptions) => {
	const tokenEndpoint = "https://www.reddit.com/api/v1/access_token";
	const tokenRequestOptions = {
		clientId: options.clientId,
		clientSecret: options.clientSecret,
	};
	const tokenEndpointAuth = {
		method: "client_secret_basic",
	} satisfies TokenEndpointAuth;

	return {
		id: "reddit",
		name: "Reddit",
		accountSubject: ({ profile }) => profile.id,
		createAuthorizationURL({ state, scopes, redirectURI, additionalParams }) {
			const _scopes = options.disableDefaultScope ? [] : ["identity"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "reddit",
				options,
				authorizationEndpoint: "https://www.reddit.com/api/v1/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				duration: options.duration,
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options: tokenRequestOptions,
				tokenEndpoint,
				tokenEndpointAuth,
				headers: {
					accept: "text/plain",
					"user-agent": "better-auth",
				},
			});
		},

		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: tokenRequestOptions,
						tokenEndpoint,
						tokenEndpointAuth,
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
			// Reddit's identity scope does not return an email. Synthesize a stable,
			// non-routable placeholder (RFC 2606 `.invalid`) keyed to the user's
			// Reddit id rather than the routable `reddit.com`, which could collide
			// with a real address. Left unverified; `mapProfileToUser` can override.
			const email =
				userMap?.email ||
				createPlaceholderEmail({
					identifier: profile.id,
					namespace: "reddit",
				});
			return {
				user: {
					name: profile.name,
					image: profile.icon_img?.split("?")[0]!,
					...userMap,
					email,
					emailVerified: userMap?.emailVerified ?? false,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<RedditProfile>;
};
