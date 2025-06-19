import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface NotionProfile {
	object: "user";
	id: string;
	type: "person" | "bot";
	name?: string;
	avatar_url?: string;
	person?: {
		email?: string;
	};
	bot?: {
		owner: {
			type: "workspace" | "user";
		};
		workspace_name?: string;
	};
}

export interface NotionOptions extends ProviderOptions<NotionProfile> {}

export const notion = (options: NotionOptions) => {
	const tokenEndpoint = "https://api.notion.com/v1/oauth/token";
	return {
		id: "notion",
		name: "Notion",
		createAuthorizationURL({ state, scopes, loginHint, redirectURI }) {
			const _scopes: string[] = options.disableDefaultScope ? [] : [];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "notion",
				options,
				authorizationEndpoint: "https://api.notion.com/v1/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
				additionalParams: {
					owner: "user",
				},
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
			const { data: profile, error } = await betterFetch<NotionProfile>(
				"https://api.notion.com/v1/users/me",
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
						"Notion-Version": "2022-06-28",
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
					name: profile.name || "Notion User",
					email: profile.person?.email || null,
					image: profile.avatar_url,
					emailVerified: !!profile.person?.email,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<NotionProfile>;
};
