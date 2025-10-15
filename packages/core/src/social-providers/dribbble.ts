import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";
import { logger } from "../env";
import { BetterAuthError } from "../error";

export interface DribbbleProfile {
	id: string;
	email: string;
	name: string;
	avatar_url: string;
	type: string;
}

export interface DribbbleOptions extends ProviderOptions<DribbbleProfile> {
	clientId: string;
}

export const dribbble = (options: DribbbleOptions) => {
	return {
		id: "dribbble",
		name: "Dribbble",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client ID and Client Secret are required for Dribbble. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Dribbble");
			}

			const _scopes = options.disableDefaultScope ? [] : ["public", "upload"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			const url = await createAuthorizationURL({
				id: "dribbble",
				options,
				authorizationEndpoint: "https://dribbble.com/oauth/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
			});

			return url;
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://dribbble.com/oauth/token",
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
						tokenEndpoint: "https://dribbble.com/oauth/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			try {
				const { data: profile } = await betterFetch<DribbbleProfile>(
					"https://api.dribbble.com/v2/user",
					{
						headers: {
							authorization: `Bearer ${token.accessToken}`,
						},
					},
				);

				if (!profile) {
					logger.error("Failed to fetch user from Dribbble");
					return null;
				}

				const userMap = await options.mapProfileToUser?.(profile);

				return {
					user: {
						id: profile.id,
					name: profile.name,
						email: profile.email,
						image: profile.avatar_url,
						emailVerified: !!profile.email,
						...userMap,
					},
					data: profile,
				};
			} catch (error) {
				logger.error("Failed to fetch user info from Dribbble:", error);
				return null;
			}
		},
		options,
	} satisfies OAuthProvider<DribbbleProfile>;
};
