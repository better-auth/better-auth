import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "@better-auth/core/oauth2";

interface LinearUser {
	id: string;
	name: string;
	email: string;
	avatarUrl?: string;
	active: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface LinearProfile {
	data: {
		viewer: LinearUser;
	};
}

export interface LinearOptions extends ProviderOptions<LinearUser> {
	clientId: string;
	actor?: "app" | "user";
}

export const linear = (options: LinearOptions) => {
	const tokenEndpoint = "https://api.linear.app/oauth/token";
	return {
		id: "linear",
		name: "Linear",
		createAuthorizationURL({ state, scopes, loginHint, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["read"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);

			const additionalParams: Record<string, string> = {};
			if (options.actor) {
				additionalParams.actor = options.actor;
			}

			return createAuthorizationURL({
				id: "linear",
				options,
				authorizationEndpoint: "https://linear.app/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
				additionalParams: additionalParams,
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

			const { data: profile, error } = await betterFetch<LinearProfile>(
				"https://api.linear.app/graphql",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token.accessToken}`,
					},
					body: JSON.stringify({
						query: `
							query {
								viewer {
									id
									name
									email
									avatarUrl
									active
									createdAt
									updatedAt
								}
							}
						`,
					}),
				},
			);

			// Handle app-actor tokens that may not have a user profile
			if (error || !profile?.data?.viewer) {
				// For app-actor flows, we might not have a user profile
				// In this case, return null to indicate no user should be created/linked
				// The token is still valid for API calls, but there's no associated user
				return null;
			}

			const userData = profile.data.viewer;
			const userMap = await options.mapProfileToUser?.(userData);

			return {
				user: {
					id: profile.data.viewer.id,
					name: profile.data.viewer.name,
					email: profile.data.viewer.email,
					image: profile.data.viewer.avatarUrl,
					emailVerified: true,
					...userMap,
				},
				data: userData,
			};
		},
		options,
	} satisfies OAuthProvider<LinearUser>;
};
