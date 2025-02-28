import { betterFetch } from "@better-fetch/fetch";
import { type OAuthProvider, type ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface VkProfile {
	user: {
		user_id: string;
		first_name: string;
		last_name: string;
		email?: string;
		phone?: number;
		avatar?: string;
		sex?: number;
		verified?: boolean;
		birthday: string;
	};
}

export const enum LANG {
	RUS = 0,
	UKR = 1,
	ENG = 3,
	SPA = 4,
	GERMAN = 6,
	POL = 15,
	FRA = 16,
	TURKEY = 82,
}

export interface VkOption extends ProviderOptions {
	lang_id?: LANG;
	scheme?: "light" | "dark";
}

export const vk = (options: VkOption) => {
	return {
		id: "vk",
		name: "VK",
		async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
			const _scopes = scopes || ["email", "phone"];
			options.scope && _scopes.push(...options.scope);
			const authorizationEndpoint = "https://id.vk.com/authorize";

			return createAuthorizationURL({
				id: "vk",
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
				tokenEndpoint: "https://id.vk.com/oauth2/auth",
			});
		},
		async getUserInfo(data) {
			if (!data.accessToken) {
				return null;
			}
			const formBody = new URLSearchParams({
				access_token: data.accessToken,
				client_id: options.clientId,
			}).toString();
			const { data: profile, error } = await betterFetch<VkProfile>(
				"https://id.vk.com/oauth2/user_info",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: formBody,
				},
			);
			if (error) {
				return null;
			}
			if (!profile.user.email) {
				return null;
			}
			return {
				user: {
					id: profile.user.user_id,
					first_name: profile.user.first_name,
					last_name: profile.user.last_name,
					email: profile.user.email,
					image: profile.user.avatar,
					/** @note VK does not provide emailVerified*/
					emailVerified: !!profile.user.email,
					birthday: profile.user.birthday,
					sex: profile.user.sex,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<VkProfile>;
};
