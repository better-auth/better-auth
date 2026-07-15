import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuth2Tokens, OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	getPrimaryClientId,
	validateAuthorizationCode,
} from "../oauth2";
import { fetchRefusingRedirects } from "../oauth2/reject-redirects";

export interface ThreadsProfile {
	id: string;
	username: string;
	name?: string | undefined;
	threads_profile_picture_url?: string | undefined;
	threads_biography?: string | undefined;
}

interface ThreadsTokenResponse {
	access_token: string;
	token_type?: string | undefined;
	expires_in?: number | undefined;
}

export interface ThreadsOptions extends ProviderOptions<ThreadsProfile> {
	clientId: string;
}

function toOAuth2Tokens(
	data: ThreadsTokenResponse,
	scopes?: string[] | undefined,
): OAuth2Tokens {
	return {
		accessToken: data.access_token,
		// Threads refreshes long-lived access tokens using the access token itself.
		// Store it in the refresh-token slot so Better Auth can invoke the provider's
		// refresh implementation when the token expires.
		refreshToken: data.access_token,
		tokenType: data.token_type,
		scopes,
		accessTokenExpiresAt: data.expires_in
			? new Date(Date.now() + data.expires_in * 1000)
			: undefined,
		raw: { ...data },
	};
}

export const threads = (options: ThreadsOptions) => {
	const tokenEndpoint = "https://graph.threads.net/oauth/access_token";
	const longLivedTokenEndpoint = "https://graph.threads.net/access_token";
	const refreshTokenEndpoint = "https://graph.threads.net/refresh_access_token";

	return {
		id: "threads",
		name: "Threads",
		async createAuthorizationURL({ state, scopes, redirectURI }) {
			if (!getPrimaryClientId(options.clientId) || !options.clientSecret) {
				logger.error(
					"Client ID and client secret are required for Threads. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			const _scopes = options.disableDefaultScope ? [] : ["threads_basic"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);

			return createAuthorizationURL({
				id: "threads",
				options,
				authorizationEndpoint: "https://threads.net/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				responseType: "code",
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			const tokens = await validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint,
			});
			if (!tokens.accessToken || !options.clientSecret) {
				return null;
			}

			const { data, error } =
				await fetchRefusingRedirects<ThreadsTokenResponse>(
					longLivedTokenEndpoint,
					{
						query: {
							grant_type: "th_exchange_token",
							client_secret: options.clientSecret,
							access_token: tokens.accessToken,
						},
					},
				);
			if (error) {
				throw error;
			}
			if (!data?.access_token) {
				throw new BetterAuthError("FAILED_TO_EXCHANGE_ACCESS_TOKEN");
			}
			return toOAuth2Tokens(data, tokens.scopes);
		},
		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					const { data, error } =
						await fetchRefusingRedirects<ThreadsTokenResponse>(
							refreshTokenEndpoint,
							{
								query: {
									grant_type: "th_refresh_token",
									access_token: refreshToken,
								},
							},
						);
					if (error) {
						throw error;
					}
					if (!data?.access_token) {
						throw new BetterAuthError("FAILED_TO_REFRESH_ACCESS_TOKEN");
					}
					return toOAuth2Tokens(data);
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			if (!token.accessToken) {
				return null;
			}

			const { data: profile, error } =
				await fetchRefusingRedirects<ThreadsProfile>(
					"https://graph.threads.net/me",
					{
						query: {
							fields:
								"id,username,name,threads_profile_picture_url,threads_biography",
						},
						headers: {
							authorization: `Bearer ${token.accessToken}`,
						},
					},
				);
			if (error || !profile) {
				return null;
			}

			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.name || profile.username,
					email: profile.username,
					image: profile.threads_profile_picture_url,
					emailVerified: false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<ThreadsProfile, ThreadsOptions>;
};
