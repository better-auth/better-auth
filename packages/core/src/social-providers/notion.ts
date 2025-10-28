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
	name?: string | undefined;
	avatar_url?: string | undefined;
	person?:
		| {
				email?: string;
		  }
		| undefined;
}

export interface NotionOptions extends ProviderOptions<NotionProfile> {
	clientId: string;
}

export const notion = (options: NotionOptions) => {
	const tokenEndpoint = "https://api.notion.com/v1/oauth/token";
	return {
		id: "notion",
		name: "Notion",
		createAuthorizationURL({ state, scopes, loginHint, redirectURI }) {
			const _scopes: string[] = options.disableDefaultScope ? [] : [];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
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
				authentication: "basic",
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
			const { data: profile, error } = await betterFetch<{
				bot: {
					owner: {
						user: NotionProfile;
					};
				};
			}>("https://api.notion.com/v1/users/me", {
				headers: {
					Authorization: `Bearer ${token.accessToken}`,
					"Notion-Version": "2022-06-28",
				},
			});
			if (error || !profile) {
				return null;
			}
			const userProfile = profile.bot?.owner?.user;
			if (!userProfile) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(userProfile);
			return {
				user: {
					id: userProfile.id,
					name: userProfile.name || "Notion User",
					email: userProfile.person?.email || null,
					image: userProfile.avatar_url,
					emailVerified: !!userProfile.person?.email,
					...userMap,
				},
				data: userProfile,
			};
		},
		options,
	} satisfies OAuthProvider<NotionProfile>;
};
