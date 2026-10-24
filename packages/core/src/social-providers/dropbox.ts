// cspell:ignore addin
import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";

interface DropboxTeamSharingPolicies {
	shared_folder_member_policy: {
		".tag": "team" | "anyone" | "team_and_approved" | "other";
	};
	shared_folder_join_policy: {
		".tag": "from_team_only" | "from_anyone" | "other";
	};
	shared_link_create_policy: {
		".tag":
			| "default_public"
			| "default_team_only"
			| "team_only"
			| "default_no_one"
			| "other";
	};
	group_creation_policy: { ".tag": "admins_and_members" | "admins_only" };
	shared_folder_link_restriction_policy: {
		".tag": "members" | "anyone" | "other";
	};
	enforce_link_password_policy: { ".tag": "optional" | "required" | "other" };
	default_link_expiration_days_policy: {
		".tag":
			| "none"
			| "day_1"
			| "day_3"
			| "day_7"
			| "day_30"
			| "day_90"
			| "day_180"
			| "year_1"
			| "other";
	};
	shared_link_default_permissions_policy: {
		".tag": "default" | "edit" | "view" | "other";
	};
}

interface DropboxTeam {
	id: string;
	name: string;
	sharing_policies: DropboxTeamSharingPolicies;
	office_addin_policy: { ".tag": "disabled" | "enabled" | "other" };
	top_level_content_policy: { ".tag": "everyone" | "admin_only" | "other" };
}

type DropboxRootInfo =
	| {
			".tag": "team";
			root_namespace_id: string;
			home_namespace_id: string;
			home_path: string;
	  }
	| {
			".tag": "user";
			root_namespace_id: string;
			home_namespace_id: string;
			home_path?: string;
	  };

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
	team?: DropboxTeam | null;
	team_member_id?: string;
	is_paired: boolean;
	account_type: { ".tag": "basic" | "pro" | "business" };
	root_info: DropboxRootInfo;
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
