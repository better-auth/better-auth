import {
	afterEach,
	assertType,
	beforeEach,
	describe,
	expect,
	expectTypeOf,
	it,
	vi,
} from "vitest";
import type { GithubProfile } from "./github";
import { github } from "./github";

const mockedFetch = vi.fn<typeof fetch>();
beforeEach(() => {
	mockedFetch.mockReset();
	vi.stubGlobal("fetch", mockedFetch);
});
afterEach(() => vi.unstubAllGlobals());

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
	])("maps a $kind API response", async ({ profile }) => {
		mockedFetch.mockImplementation(async (input, init) => {
			const request = new Request(input, init);
			expect(request.headers.get("authorization")).toBe("Bearer access-token");
			if (request.url === "https://api.github.com/user")
				return Response.json(profile);
			expect(request.url).toBe("https://api.github.com/user/emails");
			return Response.json([
				{
					email: "octocat@example.com",
					primary: true,
					verified: true,
					visibility: null,
				},
			]);
		});
		const provider = github({ clientId: "github-app" });
		const result = await provider.getUserInfo({ accessToken: "access-token" });
		expect(result?.data).toEqual({ ...profile, email: "octocat@example.com" });
		expect(result?.user).toMatchObject({
			name: "octocat",
			email: "octocat@example.com",
			emailVerified: true,
		});
	});
});

describe("github userInfoEndpoint override", () => {
	const profile = { ...publicProfile, email: null };

	function serve(userURL: string, emailsURL?: string) {
		mockedFetch.mockImplementation(async (input, init) => {
			const request = new Request(input, init);
			if (request.url === userURL) return Response.json(profile);
			if (request.url === emailsURL) {
				return Response.json([
					{
						email: "octocat@example.com",
						primary: true,
						verified: true,
						visibility: null,
					},
				]);
			}
			throw new Error(`Unexpected request to ${request.url}`);
		});
	}

	it("reads the email list next to an Enterprise Server user endpoint", async () => {
		serve(
			"https://ghe.example.com/api/v3/user",
			"https://ghe.example.com/api/v3/user/emails",
		);
		const provider = github({
			clientId: "github-app",
			userInfoEndpoint: "https://ghe.example.com/api/v3/user",
		});
		const result = await provider.getUserInfo({ accessToken: "access-token" });
		expect(result?.user).toMatchObject({
			email: "octocat@example.com",
			emailVerified: true,
		});
	});

	it("leaves the override query out of the email list request", async () => {
		serve(
			"https://ghe.example.com/api/v3/user?org=acme",
			"https://ghe.example.com/api/v3/user/emails",
		);
		const provider = github({
			clientId: "github-app",
			userInfoEndpoint: "https://ghe.example.com/api/v3/user?org=acme",
		});
		const result = await provider.getUserInfo({ accessToken: "access-token" });
		expect(result?.user.email).toBe("octocat@example.com");
	});

	it("reads the email list next to a user endpoint with a trailing slash", async () => {
		serve(
			"https://ghe.example.com/api/v3/user/",
			"https://ghe.example.com/api/v3/user/emails",
		);
		const provider = github({
			clientId: "github-app",
			userInfoEndpoint: "https://ghe.example.com/api/v3/user/",
		});
		const result = await provider.getUserInfo({ accessToken: "access-token" });
		expect(result?.user.email).toBe("octocat@example.com");
	});

	it("skips the email list when the override does not end in /user", async () => {
		serve("https://emulator.example.com/profile");
		const provider = github({
			clientId: "github-app",
			userInfoEndpoint: "https://emulator.example.com/profile",
		});
		const result = await provider.getUserInfo({ accessToken: "access-token" });
		expect(mockedFetch).toHaveBeenCalledOnce();
		expect(result?.user).toMatchObject({ emailVerified: false });
		expect(result?.data.email).toBeNull();
	});
});

/**
 * @see https://docs.github.com/en/rest/users/users#get-the-authenticated-user
 */
it("types additional GitHub account fields", () => {
	expectTypeOf<GithubProfile["user_view_type"]>().toEqualTypeOf<
		string | undefined
	>();
	expectTypeOf<GithubProfile["notification_email"]>().toEqualTypeOf<
		string | null | undefined
	>();
	expectTypeOf<GithubProfile["business_plus"]>().toEqualTypeOf<
		boolean | undefined
	>();
	expectTypeOf<GithubProfile["ldap_dn"]>().toEqualTypeOf<string | undefined>();
});
