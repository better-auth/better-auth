import { assertType, describe, expect, it } from "vitest";
import type { GithubProfile } from "./github";
import { github } from "./github";

const publicProfile = {
	login: "octocat",
	id: 583231,
	node_id: "MDQ6VXNlcjU4MzIzMQ==",
	avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
	gravatar_id: null,
	url: "https://api.github.com/users/octocat",
	html_url: "https://github.com/octocat",
	followers_url: "https://api.github.com/users/octocat/followers",
	following_url: "https://api.github.com/users/octocat/following{/other_user}",
	gists_url: "https://api.github.com/users/octocat/gists{/gist_id}",
	starred_url: "https://api.github.com/users/octocat/starred{/owner}{/repo}",
	subscriptions_url: "https://api.github.com/users/octocat/subscriptions",
	organizations_url: "https://api.github.com/users/octocat/orgs",
	repos_url: "https://api.github.com/users/octocat/repos",
	events_url: "https://api.github.com/users/octocat/events{/privacy}",
	received_events_url: "https://api.github.com/users/octocat/received_events",
	type: "User",
	site_admin: false,
	name: null,
	company: null,
	blog: null,
	location: null,
	email: null,
	hireable: null,
	bio: null,
	public_repos: 8,
	public_gists: 8,
	followers: 20,
	following: 9,
	created_at: "2011-01-25T18:44:36Z",
	updated_at: "2026-01-01T00:00:00Z",
};

const privateProfile = {
	...publicProfile,
	private_gists: 81,
	total_private_repos: 100,
	owned_private_repos: 100,
	disk_usage: 10_000,
	collaborators: 8,
	two_factor_authentication: true,
};

/**
 * @see https://github.com/better-auth/better-auth/issues/11040
 * @see https://docs.github.com/en/rest/users/users?apiVersion=2022-11-28#get-the-authenticated-user
 * @see https://github.com/github/rest-api-description/blob/93c8981e7237e38ac78867b85805077ded92ab8b/descriptions/api.github.com/api.github.com.2022-11-28.json#L91129-L91164
 */
describe("github profile", () => {
	it("accepts public and private API responses", () => {
		assertType<GithubProfile>(publicProfile);
		assertType<GithubProfile>(privateProfile);
		assertType<GithubProfile>({
			...publicProfile,
			twitter_username: "octocat",
		});
		assertType<GithubProfile>({
			...privateProfile,
			twitter_username: null,
			plan: { name: "Medium", space: 400, private_repos: 20, collaborators: 0 },
		});
	});

	it.each([
		{ kind: "public", profile: publicProfile },
		{ kind: "private", profile: privateProfile },
	])("accepts a raw $kind response from getUserInfo", async ({ profile }) => {
		const provider = github({
			clientId: "github-app",
			getUserInfo: async () => ({
				user: {
					name: profile.name ?? profile.login,
					email: profile.email,
					emailVerified: false,
				},
				data: profile,
			}),
		});

		const result = await provider.getUserInfo({ accessToken: "access-token" });
		expect(result?.data).toBe(profile);
	});
});
