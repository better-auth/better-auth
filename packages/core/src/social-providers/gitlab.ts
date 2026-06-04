import { betterFetch } from "@better-fetch/fetch";
import type { ProviderOptions, UpstreamProvider } from "../oauth2";
import {
	createAuthorizationURL,
	refreshAccessToken,
	resolveRequestedScopes,
	validateAuthorizationCode,
} from "../oauth2";

export interface GitlabProfile extends Record<string, any> {
	id: number;
	username: string;
	email: string;
	name: string;
	state: string;
	avatar_url: string;
	web_url: string;
	created_at: string;
	bio: string;
	location?: string | undefined;
	public_email: string;
	skype: string;
	linkedin: string;
	twitter: string;
	website_url: string;
	organization: string;
	job_title: string;
	pronouns: string;
	bot: boolean;
	work_information?: string | undefined;
	followers: number;
	following: number;
	local_time: string;
	last_sign_in_at: string;
	confirmed_at: string;
	theme_id: number;
	last_activity_on: string;
	color_scheme_id: number;
	projects_limit: number;
	current_sign_in_at: string;
	identities: Array<{
		provider: string;
		extern_uid: string;
	}>;
	can_create_group: boolean;
	can_create_project: boolean;
	two_factor_enabled: boolean;
	external: boolean;
	private_profile: boolean;
	commit_email: string;
	shared_runners_minutes_limit: number;
	extra_shared_runners_minutes_limit: number;
	email_verified?: boolean | undefined;
}

export interface GitlabOptions extends ProviderOptions<GitlabProfile> {
	clientId: string;
	issuer?: string | undefined;
}

const cleanDoubleSlashes = (input: string = "") => {
	return input
		.split("://")
		.map((str) => str.replace(/\/{2,}/g, "/"))
		.join("://");
};

const issuerToEndpoints = (issuer?: string | undefined) => {
	const baseUrl = issuer || "https://gitlab.com";
	return {
		authorizationEndpoint: cleanDoubleSlashes(`${baseUrl}/oauth/authorize`),
		tokenEndpoint: cleanDoubleSlashes(`${baseUrl}/oauth/token`),
		userinfoEndpoint: cleanDoubleSlashes(`${baseUrl}/api/v4/user`),
	};
};

const GITLAB_DEFAULT_SCOPES = ["read_user"];

export const gitlab = (options: GitlabOptions) => {
	const { authorizationEndpoint, tokenEndpoint, userinfoEndpoint } =
		issuerToEndpoints(options.issuer);
	const issuerId = "gitlab";
	const issuerName = "Gitlab";
	return {
		id: issuerId,
		name: issuerName,
		callbackPath: "/callback/gitlab",
		createAuthorizationURL: ({
			state,
			scopes,
			codeVerifier,
			loginHint,
			redirectURI,
			additionalParams,
		}) => {
			const requestedScopes = resolveRequestedScopes(
				options,
				GITLAB_DEFAULT_SCOPES,
				scopes,
			);
			return createAuthorizationURL({
				id: issuerId,
				options,
				authorizationEndpoint,
				scopes: requestedScopes,
				state,
				redirectURI,
				codeVerifier,
				loginHint,
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI, codeVerifier }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				codeVerifier,
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
						tokenEndpoint: tokenEndpoint,
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<GitlabProfile>(
				userinfoEndpoint,
				{ headers: { authorization: `Bearer ${token.accessToken}` } },
			);
			if (error || profile.state !== "active" || profile.locked) {
				return null;
			}
			const userMap = await options.mapProfileToUser?.(profile);
			// GitLab may provide email_verified claim, but it's not guaranteed.
			// We check for it first, then default to false for security consistency.
			return {
				user: {
					id: profile.id,
					name: profile.name ?? profile.username ?? "",
					email: profile.email,
					image: profile.avatar_url,
					emailVerified: profile.email_verified ?? false,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies UpstreamProvider<GitlabProfile>;
};
