import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
	refreshAccessToken,
} from "@better-auth/core/oauth2";

export interface NaverProfile {
	/** API response result code */
	resultcode: string;
	/** API response message */
	message: string;
	response: {
		/** Unique Naver user identifier */
		id: string;
		/** User nickname */
		nickname: string;
		/** User real name */
		name: string;
		/** User email address */
		email: string;
		/** Gender (F: female, M: male, U: unknown) */
		gender: string;
		/** Age range */
		age: string;
		/** Birthday (MM-DD format) */
		birthday: string;
		/** Birth year */
		birthyear: string;
		/** Profile image URL */
		profile_image: string;
		/** Mobile phone number */
		mobile: string;
	};
}

export interface NaverOptions extends ProviderOptions<NaverProfile> {
	clientId: string;
}

export const naver = (options: NaverOptions) => {
	return {
		id: "naver",
		name: "Naver",
		createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = options.disableDefaultScope ? [] : ["profile", "email"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "naver",
				options,
				authorizationEndpoint: "https://nid.naver.com/oauth2.0/authorize",
				scopes: _scopes,
				state,
				redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://nid.naver.com/oauth2.0/token",
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
						tokenEndpoint: "https://nid.naver.com/oauth2.0/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<NaverProfile>(
				"https://openapi.naver.com/v1/nid/me",
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
				},
			);
			if (error || !profile || profile.resultcode !== "00") {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			const res = profile.response || {};
			const user = {
				id: res.id,
				name: res.name || res.nickname,
				email: res.email,
				image: res.profile_image,
				emailVerified: false,
				...userMap,
			};
			return {
				user,
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<NaverProfile>;
};
