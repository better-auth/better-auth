import type { Provider, ProviderOptions } from "./types";

export interface GitLabProfile {
	/**
	 * the user's id (i.e. the numerical snowflake) as a string
	 */
	id: string;
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

interface GitlabOptions extends ProviderOptions<GitLabProfile> {
	domain?: string;
}

export const gitlab = (options: GitlabOptions) => {
	const domain = options?.domain ?? "https://gitlab.com";
	const authorizationEndpoint = `${domain}/oauth/authorize`;
	const tokenEndpoint = `${domain}/oauth/token`;
	return {
		id: "gitlab" as const,
		name: "Gitlab",
		type: "oauth",
		scopes: ["read_user"],
		params: {
			clientId: options.clientId,
			clientSecret: options.clientSecret,
			redirectURL: options.redirectURL,
			authorizationEndpoint,
			tokenEndpoint,
		},
		async getUserInfo(tokens) {
			const headers = {
				Authorization: `Bearer ${tokens.access_token}`,
			};
			const result = await fetch("https://gitlab.com/api/v4/user", {
				headers,
			})
				.then((res) => res.json())
				.then((res) => res as GitLabProfile);
			return {
				...result,
				id: result.id.toString(),
				email: result.public_email,
				emailVerified: true,
				image: result.avatar_url,
			};
		},
	} satisfies Provider<GitLabProfile>;
};
