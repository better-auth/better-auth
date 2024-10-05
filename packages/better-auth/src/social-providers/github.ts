import { betterFetch } from "@better-fetch/fetch";
import { GitHub } from "arctic";
import type { OAuthProvider, ProviderOptions } from ".";
import { getRedirectURI, validateAuthorizationCode } from "./utils";

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
	first_name: string;
	last_name: string;
}

export interface GithubOptions extends ProviderOptions {}
export const github = (options: GithubOptions) => {
	const githubArctic = new GitHub(
		options.clientId,
		options.clientSecret,
		getRedirectURI("github", options.redirectURI),
	);
	const tokenEndpoint = "https://github.com/login/oauth/access_token";
	return {
		id: "github",
		name: "Github",
		createAuthorizationURL({ state, scopes }) {
			const _scopes = options.scope || scopes || ["user:email"];
			return githubArctic.createAuthorizationURL(state, _scopes);
		},
		validateAuthorizationCode: async (code, _, redirect) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || getRedirectURI("google", redirect),
				options,
				tokenEndpoint,
			});
		},
		async getUserInfo(token) {
			const { data: profile, error } = await betterFetch<GithubProfile>(
				"https://api.github.com/user",
				{
					auth: {
						type: "Bearer",
						token: token.accessToken(),
					},
				},
			);
			if (error) {
				return null;
			}
			let emailVerified = false;
			if (!profile.email) {
				const { data, error } = await betterFetch<
					{
						email: string;
						primary: boolean;
						verified: boolean;
						visibility: "public" | "private";
					}[]
				>("https://api.github.com/user/emails", {
					auth: {
						type: "Bearer",
						token: token.accessToken(),
					},
				});
				if (!error) {
					profile.email = (data.find((e) => e.primary) ?? data[0])
						?.email as string;
					emailVerified =
						data.find((e) => e.email === profile.email)?.verified ?? false;
				}
			}
			return {
				user: {
					id: profile.id.toString(),
					name: profile.name || profile.login,
					email: profile.email,
					image: profile.avatar_url,
					emailVerified,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<GithubProfile>;
};
