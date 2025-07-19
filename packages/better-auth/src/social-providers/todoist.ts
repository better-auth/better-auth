import { betterFetch } from "@better-fetch/fetch";
import {
	createAuthorizationURL,
	refreshAccessToken,
	validateAuthorizationCode,
	type OAuthProvider,
	type ProviderOptions,
} from "../oauth2";

export interface TodoistProfile {
	activated_user: boolean;
	auto_reminder: number;
	avatar_big: string;
	avatar_medium: string;
	avatar_s640: string;
	avatar_small: string;
	business_account_id: string;
	daily_goal: number;
	date_format: number;
	days_off: number[];
	email: string;
	feature_identifier: string;
	features: {
		beta: number;
		dateist_inline_disabled: boolean;
		dateist_lang: string | null;
		"global.teams": boolean;
		has_push_reminders: boolean;
		karma_disabled: boolean;
		karma_vacation: boolean;
		kisa_consent_timestamp: string | null;
		restriction: number;
	};
	full_name: string;
	has_password: boolean;
	id: string;
	image_id: string;
	inbox_project_id: string;
	is_celebrations_enabled: boolean;
	is_premium: boolean;
	joinable_workspace: string | null;
	joined_at: string;
	karma: number;
	karma_trend: string;
	lang: string;
	mfa_enabled: boolean;
	next_week: number;
	premium_status: string;
	premium_until: string | null;
	share_limit: number;
	sort_order: number;
	start_day: number;
	start_page: string;
	theme_id: string;
	time_format: number;
	token: string;
	tz_info: {
		gmt_string: string;
		hours: number;
		is_dst: number;
		minutes: number;
		timezone: string;
	};
	verification_status: string;
	weekend_start_day: number;
	weekly_goal: number;
}

export interface TodoistSyncResponse {
	full_sync: boolean;
	sync_token: string;
	temp_id_mapping: Record<string, unknown>;
	user: TodoistProfile;
}

export interface TodoistOptions extends ProviderOptions<TodoistProfile> {}

export const todoist = (options: TodoistOptions) => {
	const tokenEndpoint = "https://todoist.com/oauth/access_token";

	return {
		id: "todoist",
		name: "Todoist",
		createAuthorizationURL({ state, scopes, redirectURI, loginHint }) {
			const _scopes: string[] = options.disableDefaultScope
				? []
				: ["data:read"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "todoist",
				options,
				authorizationEndpoint: "https://todoist.com/oauth/authorize",
				scopes: _scopes,
				state,
				redirectURI,
				loginHint,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
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

			const { data, error } = await betterFetch<TodoistSyncResponse>(
				"https://api.todoist.com/api/v1/sync",
				{
					headers: {
						Authorization: `Bearer ${token.accessToken}`,
					},
					method: "POST",
					body: new URLSearchParams({
						sync_token: "*",
						resource_types: '["user"]',
					}),
				},
			);

			if (error) {
				return null;
			}

			const profile = data.user;

			const userMap = await options.mapProfileToUser?.(profile);

			return {
				user: {
					id: profile.id,
					name: profile.full_name,
					email: profile.email,
					image: profile.avatar_medium,
					emailVerified: profile.verification_status === "verified",
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<TodoistProfile>;
};
