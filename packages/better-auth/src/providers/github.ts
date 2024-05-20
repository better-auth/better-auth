import type { User } from "../adapters/types";
import type { OAuthProvider, Provider, ProviderOptions } from "./types";

interface GithubProfile {
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

export interface GitHubOptions extends ProviderOptions<GithubProfile> {
	/**
	 * Whether or not unauthenticated users will be offered
	 * an option to sign up for GitHub during the OAuth flow
	 * The default is true. Use false when a policy prohibits
	 * signup.
	 */
	allowSignup?: boolean;
}

/**
 * Github OAuth provider. This provider allows users to sign
 * in with their Github account.
 */
export const github = (options: GitHubOptions) => {
	return {
		id: "github" as const,
		name: "Github",
		type: "oauth",
		params: {
			clientId: options.clientId,
			clientSecret: options.clientSecret,
			redirectURL: options.redirectURL,
			linkAccounts: options.linkAccounts,
			tokenEndpoint: "https://github.com/login/oauth/access_token",
			authorizationEndpoint: "https://github.com/login/oauth/authorize",
			extra: {
				allow_signup:
					options.allowSignup === undefined
						? "true"
						: options.allowSignup
							? "true"
							: "false",
			},
		},
		scopes: options.scopes || ["read:user user:email"],
		async getUserInfo(tokens) {
			const response = await fetch("https://api.github.com/user", {
				headers: {
					Authorization: `Bearer ${tokens.access_token}`,
				},
			});
			const profile = (await response.json()) as GithubProfile;
			if (!profile.email) {
				const res = await fetch("https://api.github.com/user/emails", {
					headers: {
						Authorization: `Bearer ${tokens.access_token}`,
						"User-Agent": "better-auth",
					},
				});

				if (res.ok) {
					const emails: {
						email: string;
						primary: boolean;
						verified: boolean;
						visibility: "public" | "private";
					}[] = await res.json();
					profile.email = (emails.find((e) => e.primary) ?? emails[0])
						?.email as string;
				}
			}
			return {
				...profile,
				id: profile.id,
				first_name: profile.name.split(" ")[0] || "",
				last_name: profile.name.split(" ")[1] || "",
			};
		},
	} satisfies Provider<GithubProfile>;
};
