// cspell:ignore addin
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
	profile_photo_url?: string;
	disabled: boolean;
	country?: string;
	locale: string;
	referral_link: string;
	team?: {
		id: string;
		name: string;
		sharing_policies: {
			shared_folder_member_policy: { ".tag": string };
			shared_folder_join_policy: { ".tag": string };
			shared_link_create_policy: { ".tag": string };
			group_creation_policy: { ".tag": string };
			shared_folder_link_restriction_policy: { ".tag": string };
			enforce_link_password_policy: { ".tag": string };
			default_link_expiration_days_policy: { ".tag": string };
			shared_link_default_permissions_policy: { ".tag": string };
		};
		office_addin_policy: { ".tag": "disabled" | "enabled" | "other" };
		top_level_content_policy: { ".tag": "everyone" | "admin_only" | "other" };
	};
	team_member_id?: string;
	is_paired: boolean;
	account_type: { ".tag": "basic" | "pro" | "business" };
	root_info: {
		root_namespace_id: string;
		home_namespace_id: string;
		".tag": "team" | "user";
		home_path?: string;
	};
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
		accountSubject: ({ profile }) => profile.account_id,
		createAuthorizationURL: async ({
			state,
			scopes,
			codeVerifier,
			redirectURI,
			additionalParams,
		}) => {
			const _scopes = options.disableDefaultScope ? [] : ["account_info.read"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: "dropbox",
				options,
				authorizationEndpoint: "https://www.dropbox.com/oauth2/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
				additionalParams: {
					...(options.accessType
						? { token_access_type: options.accessType }
						: {}),
					...(additionalParams ?? {}),
				},
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
						tokenEndpoint,
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
