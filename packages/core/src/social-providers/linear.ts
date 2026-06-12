import { betterFetch } from "@better-fetch/fetch";
import type { ProviderOptions, UpstreamProvider } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	resolveRequestedScopes,
	validateAuthorizationCode,
} from "../oauth2";

export interface LinearUser {
	id: string;
	name: string;
	email: string;
	avatarUrl?: string | undefined;
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
}

const LINEAR_DEFAULT_SCOPES = ["read"];

export const linear = (options: LinearOptions) => {
	const tokenEndpoint = "https://api.linear.app/oauth/token";
	return {
		id: "linear",
		name: "Linear",
		callbackPath: "/callback/linear",
		createAuthorizationURL({
			state,
			scopes,
			loginHint,
			redirectURI,
			additionalParams,
		}) {
			const requestedScopes = resolveRequestedScopes(
				options,
				LINEAR_DEFAULT_SCOPES,
				scopes,
			);
			return createAuthorizationURL({
				id: "linear",
				options,
				authorizationEndpoint: "https://linear.app/oauth/authorize",
				scopes: requestedScopes,
				state,
				redirectURI,
				loginHint,
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
			if (error || !profile?.data?.viewer) {
				return null;
			}

			const userData = profile.data.viewer;
			const userMap = await options.mapProfileToUser?.(userData);
			// Linear does not provide email_verified claim.
			// We default to false for security consistency.
			return {
				user: {
					id: profile.data.viewer.id,
					name: profile.data.viewer.name,
					email: profile.data.viewer.email,
					image: profile.data.viewer.avatarUrl,
					emailVerified: false,
					...userMap,
				},
				data: userData,
			};
		},
		options,
	} satisfies UpstreamProvider<LinearUser>;
};
