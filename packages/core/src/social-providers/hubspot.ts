import { betterFetch } from "@better-fetch/fetch";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface HubspotProfile {
	app_id: number;
	expires_in: number;
	hub_domain: string;
	hub_id: number;
	is_private_distribution: boolean;
	scopes: string[];
	signed_access_token: {
		appId: number;
		expiresAt: number;
		hubId: number;
		hublet: string;
		installingUserId: number;
		isPrivateDistribution: boolean;
		isServiceAccount: boolean;
		isUserLevel: boolean;
		newSignature: string;
		scopeToScopeGroupPks: string;
		scopes: string;
		signature: string;
		trialScopeToScopeGroupPks: string;
		trialScopes: string;
		userId: number;
	};
	token: string;
	token_type: string;
	user: string;
	user_id: number;
}

export interface HubspotOptions extends ProviderOptions<HubspotProfile> {
	clientId: string;
	clientSecret: string;
}

export const hubspot = (options: HubspotOptions) => {
	const userInfoEndpoint = "https://api.hubapi.com/oauth/v1/access-tokens/";
	const tokenEndpoint = "https://api.hubapi.com/oauth/v1/token";
	const authorizationEndpoint = "https://app.hubspot.com/oauth/authorize";
	return {
		id: "hubspot",
		name: "Hubspot",
		async createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			loginHint,
			display,
		}) {
			if (!options.clientId || !options.clientSecret) {
				logger.error(
					"Client Id and Client Secret is required for Hubspot2. Make sure to provide them in the options.",
				);
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}
			if (!codeVerifier) {
				throw new BetterAuthError("codeVerifier is required for Hubspot");
			}
			const _scopes = ["oauth"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "hubspot",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
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
				logger.error("No accessToken found in token");
				return null;
			}
			const tokenBaseUrl = new URL(
				token.accessToken,
				userInfoEndpoint,
			).toString();
			const { data: user } = await betterFetch<HubspotProfile>(tokenBaseUrl);

			if (!user) {
				logger.error("Failed to fetch user info from Hubspot");
				return null;
			}

			const userMap = await options.mapProfileToUser?.(user);
			return {
				user: {
					id: user.user_id,
					name: user.user,
					emailVerified: true,
					email: user.user,
					...userMap,
				},
				data: user,
			};
		},
		options,
	} satisfies OAuthProvider<HubspotProfile>;
};
