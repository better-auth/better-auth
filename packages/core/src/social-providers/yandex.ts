import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface YandexProfile {
	login: string;
	id: string;
	client_id: string;
	uid: string;
	psuid: string;
	emails?: string[];
	default_email?: string;
	email?: string;
	is_avatar_empty?: boolean;
	default_avatar_id?: string;
	avatar_id?: string;
	birthday?: string | null;
	first_name?: string;
	last_name?: string;
	display_name?: string;
	real_name?: string;
	sex?: "male" | "female" | null;
	default_phone?: { id: number; number: string };
}

export interface YandexOptions extends ProviderOptions<YandexProfile> {
	clientId: string;
}

export const yandex = (options: YandexOptions) => {
	return {
		id: "yandex",
		name: "Yandex",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["login:info", "login:email", "login:avatar"];

			if (options.scope) {
				_scopes.push(...options.scope);
			}

			if (scopes) {
				_scopes.push(...scopes);
			}

			return createAuthorizationURL({
				id: "yandex",
				options,
				authorizationEndpoint: "https://oauth.yandex.com/authorize",
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
				tokenEndpoint: "https://oauth.yandex.ru/token",
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
						authentication: "basic",
						tokenEndpoint: "https://oauth.yandex.com/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			const { data: profile, error } = await betterFetch<YandexProfile>(
				"https://login.yandex.ru/info?format=json",
				{
					method: "GET",
					headers: {
						Authorization: `OAuth ${token.accessToken}`,
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
					name: profile.display_name ?? profile.real_name ?? profile.first_name ?? profile.login,
					email: profile.default_email ?? profile.emails?.[0] ?? null,
					emailVerified: !!profile.default_email || !!profile.emails?.length,
					image:
						!profile.is_avatar_empty && profile.default_avatar_id
							? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
							: undefined,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<YandexProfile>;
};
