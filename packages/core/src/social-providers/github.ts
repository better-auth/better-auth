import { betterFetch } from "@better-fetch/fetch";
import { logger } from "../env";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	getOAuth2Tokens,
	refreshAccessToken,
} from "../oauth2";
import { createAuthorizationCodeRequest } from "../oauth2/validate-authorization-code";

export interface GithubProfile {
	login: string;
	id: string;
	node_id: string;
	avatar_url: string;
	gravatar_id: string;
	url: string;
	html_url: string;
	followers_url: string;
	following_url: string;
	gists_url: string;
	starred_url: string;
	subscriptions_url: string;
	organizations_url: string;
	repos_url: string;
	events_url: string;
	received_events_url: string;
	type: string;
	site_admin: boolean;
	name: string;
	company: string;
	blog: string;
	location: string;
	email: string;
	hireable: boolean;
	bio: string;
	twitter_username: string;
	public_repos: string;
	public_gists: string;
	followers: string;
	following: string;
	created_at: string;
	updated_at: string;
	private_gists: string;
	total_private_repos: string;
	owned_private_repos: string;
	disk_usage: string;
	collaborators: string;
	two_factor_authentication: boolean;
	plan: {
		name: string;
		space: string;
		private_repos: string;
		collaborators: string;
	};
}

export interface GithubOptions extends ProviderOptions<GithubProfile> {
	clientId: string;
}
export const github = (options: GithubOptions) => {
	const tokenEndpoint = "https://github.com/login/oauth/access_token";
	return {
		id: "github",
		name: "GitHub",
		createAuthorizationURL({
			state,
			scopes,
			loginHint,
			codeVerifier,
			redirectURI,
		}) {
			const _scopes = options.disableDefaultScope
				? []
				: ["read:user", "user:email"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "github",
				options,
				authorizationEndpoint: "https://github.com/login/oauth/authorize",
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				loginHint,
				prompt: options.prompt,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			const { body, headers: requestHeaders } = createAuthorizationCodeRequest({
				code,
				codeVerifier,
				redirectURI,
				options,
			});

			const { data, error } = await betterFetch<
				| { access_token: string; token_type: string; scope: string }
				| { error: string; error_description?: string; error_uri?: string }
			>(tokenEndpoint, {
				method: "POST",
				body: body,
				headers: requestHeaders,
			});

			if (error) {
				logger.error("GitHub OAuth token exchange failed:", error);
				return null;
			}

			if ("error" in data) {
				logger.error("GitHub OAuth token exchange failed:", data);
				return null;
			}

			return getOAuth2Tokens(data);
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
						tokenEndpoint: "https://github.com/login/oauth/access_token",
					});
				},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<GithubProfile>(
				"https://api.github.com/user",
				{
					headers: {
						"User-Agent": "better-auth",
						authorization: `Bearer ${token.accessToken}`,
					},
				},
			);
			if (error) {
				return null;
			}
			const { data: emails } = await betterFetch<
				{
					email: string;
					primary: boolean;
					verified: boolean;
					visibility: "public" | "private";
				}[]
			>("https://api.github.com/user/emails", {
				headers: {
					Authorization: `Bearer ${token.accessToken}`,
					"User-Agent": "better-auth",
				},
			});

			if (!profile.email && emails) {
				profile.email = (emails.find((e) => e.primary) ?? emails[0])
					?.email as string;
			}
			const emailVerified =
				emails?.find((e) => e.email === profile.email)?.verified ?? false;

			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.name || profile.login,
					email: profile.email,
					image: profile.avatar_url,
					emailVerified,
					...userMap,
				},
				data: profile,
			};
		},
		options,
	} satisfies OAuthProvider<GithubProfile>;
};
