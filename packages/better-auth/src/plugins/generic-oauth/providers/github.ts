import type { OAuth2Tokens, OAuth2UserInfo } from "@better-auth/core/oauth2";
import { betterFetch } from "@better-fetch/fetch";
import type { GenericOAuthConfig } from "../index";

/**
 * Provider definition based on Auth.js/NextAuth.js
 * Source: https://github.com/nextauthjs/next-auth
 * Adapted for Better Auth's GenericOAuthConfig format
 */

export interface GitHubOptions {
	/** GitHub OAuth client ID */
	clientId: string;
	/** GitHub OAuth client secret */
	clientSecret: string;
	/**
	 * Array of OAuth scopes to request.
	 * @default ["read:user", "user:email"]
	 */
	scopes?: string[];
	/**
	 * Custom redirect URI.
	 * If not provided, a default URI will be constructed.
	 */
	redirectURI?: string;
	/**
	 * Whether to use PKCE (Proof Key for Code Exchange)
	 * @default false
	 */
	pkce?: boolean;
	/**
	 * Disable implicit sign up for new users.
	 */
	disableImplicitSignUp?: boolean;
	/**
	 * Disable sign up for new users.
	 */
	disableSignUp?: boolean;
	/**
	 * Override user info with the provider info on sign in.
	 */
	overrideUserInfo?: boolean;
}

interface GitHubProfile {
	login: string;
	id: number;
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
}

interface GitHubEmail {
	email: string;
	primary: boolean;
	verified: boolean;
	visibility: "public" | "private";
}

/**
 * GitHub OAuth provider helper
 *
 * @example
 * ```ts
 * import { genericOAuth, github } from "better-auth/plugins/generic-oauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         github({
 *           clientId: process.env.GITHUB_CLIENT_ID,
 *           clientSecret: process.env.GITHUB_CLIENT_SECRET,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export function github(options: GitHubOptions): GenericOAuthConfig {
	const defaultScopes = ["read:user", "user:email"];

	const getUserInfo = async (
		tokens: OAuth2Tokens,
	): Promise<OAuth2UserInfo | null> => {
		const { data: profile, error } = await betterFetch<GitHubProfile>(
			"https://api.github.com/user",
			{
				headers: {
					"User-Agent": "better-auth",
					Authorization: `Bearer ${tokens.accessToken}`,
				},
			},
		);

		if (error || !profile) {
			return null;
		}

		const { data: emails } = await betterFetch<GitHubEmail[]>(
			"https://api.github.com/user/emails",
			{
				headers: {
					Authorization: `Bearer ${tokens.accessToken}`,
					"User-Agent": "better-auth",
				},
			},
		);

		if (!profile.email && emails && emails.length > 0) {
			profile.email =
				emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? null;
		}

		const emailVerified =
			emails?.find((e) => e.email === profile.email)?.verified ?? false;

		return {
			id: String(profile.id),
			name: profile.name || profile.login,
			email: profile.email ?? undefined,
			image: profile.avatar_url,
			emailVerified,
		};
	};

	return {
		providerId: "github",
		authorizationUrl: "https://github.com/login/oauth/authorize",
		tokenUrl: "https://github.com/login/oauth/access_token",
		userInfoUrl: "https://api.github.com/user",
		clientId: options.clientId,
		clientSecret: options.clientSecret,
		scopes: options.scopes ?? defaultScopes,
		redirectURI: options.redirectURI,
		pkce: options.pkce,
		disableImplicitSignUp: options.disableImplicitSignUp,
		disableSignUp: options.disableSignUp,
		overrideUserInfo: options.overrideUserInfo,
		getUserInfo,
	};
}
