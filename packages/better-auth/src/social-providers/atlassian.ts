import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";
import { logger } from "@better-auth/core/env";
import { refreshAccessToken } from "@better-auth/core/oauth2";

export interface AtlassianProfile {
	account_type?: string;
	account_id: string;
	email?: string;
	name: string;
	picture?: string;
	nickname?: string;
	locale?: string;
	extended_profile?: {
		job_title?: string;
		organization?: string;
		department?: string;
		location?: string;
	};
}
export interface AtlassianOptions extends ProviderOptions<AtlassianProfile> {
	clientId: string;
}

export const atlassian = (options: AtlassianOptions) => {
	return {
		id: "atlassian",
		name: "Atlassian",

		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error("Client Id and Secret are required for Atlassian");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Atlassian");
			}

			const _scopes = options.disableDefaultScope
				? []
				: ["read:jira-user", "offline_access"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			return createAuthorizationURL({
				id: "atlassian",
				options,
				authorizationEndpoint: "https://auth.atlassian.com/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				additionalParams: {
					audience: "api.atlassian.com",
				},
				prompt: options.prompt,
			});
		},

		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options,
				tokenEndpoint: "https://auth.atlassian.com/oauth/token",
			});
		},

		refreshAccessToken: options.refreshAccessToken
			? options.refreshAccessToken
			: async (refreshToken) => {
					return refreshAccessToken({
						refreshToken,
						options: {
							clientId: options.clientId,
							clientSecret: options.clientSecret,
						},
						tokenEndpoint: "https://auth.atlassian.com/oauth/token",
					});
				},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			if (!token.accessToken) {
				return null;
			}

			try {
				const { data: profile } = await betterFetch<{
					account_id: string;
					name: string;
					email?: string;
					picture?: string;
				}>("https://api.atlassian.com/me", {
					headers: { Authorization: `Bearer ${token.accessToken}` },
				});

				if (!profile) return null;

				const userMap = await options.mapProfileToUser?.(profile);

				return {
					user: {
						id: profile.account_id,
						name: profile.name,
						email: profile.email,
						image: profile.picture,
						emailVerified: false,
						...userMap,
					},
					data: profile,
				};
			} catch (error) {
				logger.error("Failed to fetch user info from Figma:", error);
				return null;
			}
		},

		options,
	} satisfies OAuthProvider<AtlassianProfile>;
};
