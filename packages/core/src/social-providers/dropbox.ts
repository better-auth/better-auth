import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

export interface DropboxProfile {
	account_id: string;
	name: {
		given_name: string;
		surname: string;
		familiar_name: string;
		display_name: string;
		abbreviated_name: string;
	};
	email: string;
	email_verified: boolean;
	profile_photo_url: string;
}

export interface DropboxOptions extends ProviderOptions<DropboxProfile> {
	clientId: string;
	accessType?: ("offline" | "online" | "legacy") | undefined;
}

export const dropbox = (options: DropboxOptions) => {
	const tokenEndpoint = "https://api.dropboxapi.com/oauth2/token";

	return {
		id: "dropbox",
		name: "Dropbox",
		createAuthorizationURL: async ({
			state,
			scopes,
			codeVerifier,
			redirectURI,
		}) => {
			const _scopes = options.disableDefaultScope ? [] : ["account_info.read"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			const additionalParams: Record<string, string> = {};
			if (options.accessType) {
				additionalParams.token_access_type = options.accessType;
			}
			return await createAuthorizationURL({
				id: "dropbox",
				options,
				authorizationEndpoint: "https://www.dropbox.com/oauth2/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return await validateAuthorizationCode({
				code,
				codeVerifier,
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
						tokenEndpoint: "https://api.dropbox.com/oauth2/token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<DropboxProfile>(
				"https://api.dropboxapi.com/2/users/get_current_account",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
				},
			);

			if (error) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.account_id,
					name: profile.name?.display_name,
					email: profile.email,
					emailVerified: profile.email_verified || false,
					image: profile.profile_photo_url,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<DropboxProfile>;
};
