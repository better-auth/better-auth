import { betterFetch } from "@better-fetch/fetch";
import { logger } from "../env";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
	createAuthorizationURL,
	getOAuth2Tokens,
	refreshAccessToken,
} from "../oauth2";
import { authorizationCodeRequest } from "../oauth2/validate-authorization-code";

export interface GithubProfile {
	login: string;
	id: number;
	node_id: string;
	avatar_url: string;
	gravatar_id: string | null;
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
	name: string | null;
	company: string | null;
	blog: string | null;
	location: string | null;
	email: string | null;
	hireable: boolean | null;
	bio: string | null;
	twitter_username: string | null;
	public_repos: number;
	public_gists: number;
	followers: number;
	following: number;
	created_at: string;
	updated_at: string;
	/** Present only on the authenticated `GET /user` response. */
	private_gists?: number;
	/** Present only on the authenticated `GET /user` response. */
	total_private_repos?: number;
	/** Present only on the authenticated `GET /user` response. */
	owned_private_repos?: number;
	/** Present only on the authenticated `GET /user` response. */
	disk_usage?: number;
	/** Present only on the authenticated `GET /user` response. */
	collaborators?: number;
	/** Present only on the authenticated `GET /user` response. */
	two_factor_authentication?: boolean;
	/** Present only on the authenticated `GET /user` response. */
	plan?: {
		name: string;
		space: number;
		private_repos: number;
		collaborators: number;
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
		accountSubject: ({ profile }) => profile.id,
		createAuthorizationURL({
			state,
			scopes,
			loginHint,
			codeVerifier,
			redirectURI,
			additionalParams,
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
				additionalParams,
			});
		},
		validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
			const { body, headers: requestHeaders } = await authorizationCodeRequest({
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
						tokenEndpoint,
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
					name: profile.name || profile.login || "",
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
