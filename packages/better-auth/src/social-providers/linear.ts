import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface LinearProfile {
	id: string;
	name: string;
	displayName: string;
	email: string;
	avatarUrl: string;
	active: boolean;
	admin: boolean;
	createdAt: string;
	updatedAt: string;
	timezone: string;
	guest: boolean;
}

export interface LinearOptions extends ProviderOptions<LinearProfile> {}

export const linear = (options: LinearOptions) => {
	const tokenEndpoint = "https://api.linear.app/oauth/token";
	return {
		id: "linear",
		name: "Linear",
		createAuthorizationURL({ state, scopes, loginHint, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["read"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "linear",
				options,
				authorizationEndpoint: "https://linear.app/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
				prompt: options.prompt,
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

			const query = `
				query Me {
					viewer {
						id
						name
						displayName
						email
						avatarUrl
						active
						admin
						createdAt
						updatedAt
						timezone
						guest
					}
				}
			`;

			const { data, error } = await betterFetch<{
				data: { viewer: LinearProfile };
			}>("https://api.linear.app/graphql", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ query }),
			});

			if (error || !data?.data?.viewer) {
				return null;
			}

			const profile = data.data.viewer;
			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.id,
					name: profile.displayName || profile.name,
					email: profile.email,
					image: profile.avatarUrl,
					emailVerified: true, // Linear accounts are typically verified
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<LinearProfile>;
};