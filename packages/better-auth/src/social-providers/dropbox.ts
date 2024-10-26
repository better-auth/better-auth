import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

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

export interface DropboxOptions extends ProviderOptions {}

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
			const _scopes = scopes || ["account_info.read"];
			options.scope && _scopes.push(...options.scope);
			return await createAuthorizationURL({
				id: "dropbox",
				options,
				authorizationEndpoint: "https://www.dropbox.com/oauth2/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			return await validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint,
			});
		},
		async getUserInfo(token) {
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

			return {
				user: {
					id: profile.account_id,
					name: profile.name?.display_name,
					email: profile.email,
					emailVerified: profile.email_verified || false,
					image: profile.profile_photo_url,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<DropboxProfile>;
};
