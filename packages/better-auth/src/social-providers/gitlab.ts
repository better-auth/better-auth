import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

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

export interface GitlabOptions extends ProviderOptions {
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
			redirectURI,
		}) => {
			const _scopes = scopes || ["read_user"];
			options.scope && _scopes.push(...options.scope);
			return await createAuthorizationURL({
				id: issuerId,
				options,
				authorizationEndpoint,
				scopes: _scopes,
				state,
				redirectURI,
				codeVerifier,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint,
			});
		},
		async getUserInfo(token) {
			const { data: profile, error } = await betterFetch<GitlabProfile>(
				userinfoEndpoint,
				{ headers: { authorization: `Bearer ${token.accessToken}` } },
			);
			if (error || profile.state !== "active" || profile.locked) {
				return null;
			}
			return {
				user: {
					id: profile.id.toString(),
					name: profile.name ?? profile.username,
					email: profile.email,
					image: profile.avatar_url,
					emailVerified: true,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<GitlabProfile>;
};
