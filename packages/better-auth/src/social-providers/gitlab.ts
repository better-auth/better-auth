import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "@better-auth/core/oauth2";
import {
	createAuthorizationURL,
	validateAuthorizationCode,
	refreshAccessToken,
} from "@better-auth/core/oauth2";

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
	location?: string;
	public_email: string;
	skype: string;
	linkedin: string;
	twitter: string;
	website_url: string;
	organization: string;
	job_title: string;
	pronouns: string;
	bot: boolean;
	work_information?: string;
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
}

export interface GitlabOptions extends ProviderOptions<GitlabProfile> {
	clientId: string;
	issuer?: string;
}

const cleanDoubleSlashes = (input: string = "") => {
	return input
		.split("://")
		.map((str) => str.replace(/\/{2,}/g, "/"))
		.join("://");
};

const issuerToEndpoints = (issuer?: string) => {
	let baseUrl = issuer || "https://gitlab.com";
	return {
		authorizationEndpoint: cleanDoubleSlashes(`${baseUrl}/oauth/authorize`),
		tokenEndpoint: cleanDoubleSlashes(`${baseUrl}/oauth/token`),
		userinfoEndpoint: cleanDoubleSlashes(`${baseUrl}/api/v4/user`),
	};
};

export const gitlab = (options: GitlabOptions) => {
	const { authorizationEndpoint, tokenEndpoint, userinfoEndpoint } =
		issuerToEndpoints(options.issuer);
	const issuerId = "gitlab";
	const issuerName = "Gitlab";
	return {
		id: issuerId,
		name: issuerName,
		createAuthorizationURL: async ({
			state,
			scopes,
			codeVerifier,
			loginHint,
			redirectURI,
		}) => {
			const _scopes = options.disableDefaultScope ? [] : ["read_user"];
			options.scope && _scopes.push(...options.scope);
			scopes && _scopes.push(...scopes);
			return await createAuthorizationURL({
				id: issuerId,
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
				loginHint,
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
			return {
				user: {
					id: profile.id,
					name: profile.name ?? profile.username,
					email: profile.email,
					image: profile.avatar_url,
					emailVerified: true,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<GitlabProfile>;
};
