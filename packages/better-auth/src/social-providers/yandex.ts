import { betterFetch } from "@better-fetch/fetch";
import { type OAuthProvider, type ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface YandexProfile {
	login: string;
	id: string;
	client_id: string;
	psuid: string;
	emails?: string[];
	default_email?: string;
	is_avatar_empty?: boolean;
	default_avatar_id?: string;
	birthday?: string | null;
	first_name?: string;
	last_name?: string;
	display_name?: string;
	real_name?: string;
	sex?: "male" | "female" | null;
	default_phone?: { id: number; number: string };
}

export interface YandexOptions extends ProviderOptions {}

export const yandex = (options: YandexOptions) => {
	return {
		id: "yandex",
		name: "Yandex",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = options.disableDefaultScope
				? []
				: ["login:info", "login:email", "login:avatar"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			const authorizationEndpoint = "https://oauth.yandex.ru/authorize";

			return createAuthorizationURL({
				id: "yandex",
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
			});
		},
		validateAuthorizationCode: async ({
			code,
			codeVerifier,
			redirectURI,
			deviceId,
		}) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI,
				options,
				deviceId,
				tokenEndpoint: "https://oauth.yandex.ru/token",
			});
		},
		async getUserInfo(data) {
			if (options.getUserInfo) {
				return options.getUserInfo(data);
			}
			if (!data.accessToken) {
				return null;
			}

			const { data: profile, error } = await betterFetch<YandexProfile>(
				"https://login.yandex.ru/info?format=json",
				{
					method: "GET",
					headers: {
						Authorization: `OAuth ${data.accessToken}`,
					},
				},
			);

			if (error || !profile) {
				return null;
			}

			return {
				user: {
					id: profile.id,
					name: profile.display_name ?? profile.real_name ?? profile.first_name,
					email: profile.default_email ?? profile.emails?.[0] ?? null,
					image:
						!profile.is_avatar_empty && profile.default_avatar_id
							? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
							: undefined,
					first_name: profile.first_name,
					last_name: profile.last_name,
					emailVerified: !!profile.default_email || !!profile.emails?.length,
					birthday: profile.birthday,
					sex: profile.sex,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<YandexProfile>;
};
