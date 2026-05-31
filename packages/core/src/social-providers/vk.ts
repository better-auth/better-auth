import { betterFetch } from "@better-fetch/fetch";
import type { ProviderOptions, UpstreamProvider } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	resolveRequestedScopes,
	validateAuthorizationCode,
} from "../oauth2";

export interface VkProfile {
	user: {
		user_id: string;
		first_name: string;
		last_name: string;
		email?: string | undefined;
		phone?: number | undefined;
		avatar?: string | undefined;
		sex?: number | undefined;
		verified?: boolean | undefined;
		birthday: string;
	};
}

export interface VkOption extends ProviderOptions {
	clientId: string;
	scheme?: ("light" | "dark") | undefined;
}

const VK_DEFAULT_SCOPES = ["email", "phone"];

export const vk = (options: VkOption) => {
	const tokenEndpoint = "https://id.vk.com/oauth2/auth";
	return {
		id: "vk",
		name: "VK",
		callbackPath: "/callback/vk",
		createAuthorizationURL({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			additionalParams,
		}) {
			const requestedScopes = resolveRequestedScopes(
				options,
				VK_DEFAULT_SCOPES,
				scopes,
			);
			const authorizationEndpoint = "https://id.vk.com/authorize";

			return createAuthorizationURL({
				id: "vk",
				options,
				authorizationEndpoint,
				scopes: requestedScopes,
				state,
				redirectURI,
				codeVerifier,
				additionalParams,
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
		async getUserInfo(data) {
			if (options.getUserInfo) {
				return options.getUserInfo(data);
			}
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

			const userMap = await options.mapProfileToUser?.(profile);
			if (!profile.user.email && !userMap?.email) {
				return null;
			}

			return {
				user: {
					id: profile.user.user_id,
					first_name: profile.user.first_name,
					last_name: profile.user.last_name,
					email: profile.user.email,
					image: profile.user.avatar,
					emailVerified: false,
					birthday: profile.user.birthday,
					sex: profile.user.sex,
					name: `${profile.user.first_name} ${profile.user.last_name}`,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies UpstreamProvider<VkProfile>;
};
