import type {
	GithubProfile,
	GoogleProfile,
} from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { signJWT } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";

const sharedAccountId = "shared-provider-account-id";
const sharedEmail = "test@test.com";

const githubProfile: GithubProfile = {
	login: "test-user",
	id: sharedAccountId,
	node_id: "node-id",
	avatar_url: "https://avatars.githubusercontent.com/u/12345",
	gravatar_id: "",
	url: "https://api.github.com/users/test-user",
	html_url: "https://github.com/test-user",
	followers_url: "https://api.github.com/users/test-user/followers",
	following_url:
		"https://api.github.com/users/test-user/following{/other_user}",
	gists_url: "https://api.github.com/users/test-user/gists{/gist_id}",
	starred_url: "https://api.github.com/users/test-user/starred{/owner}{/repo}",
	subscriptions_url: "https://api.github.com/users/test-user/subscriptions",
	organizations_url: "https://api.github.com/users/test-user/orgs",
	repos_url: "https://api.github.com/users/test-user/repos",
	events_url: "https://api.github.com/users/test-user/events{/privacy}",
	received_events_url: "https://api.github.com/users/test-user/received_events",
	type: "User",
	site_admin: false,
	name: "GitHub Test User",
	company: "",
	blog: "",
	location: "",
	email: sharedEmail,
	hireable: false,
	bio: "",
	twitter_username: "",
	public_repos: "0",
	public_gists: "0",
	followers: "0",
	following: "0",
	created_at: "2024-01-01T00:00:00Z",
	updated_at: "2024-01-01T00:00:00Z",
	private_gists: "0",
	total_private_repos: "0",
	owned_private_repos: "0",
	disk_usage: "0",
	collaborators: "0",
	two_factor_authentication: false,
	plan: {
		name: "free",
		space: "0",
		private_repos: "0",
		collaborators: "0",
	},
};

const googleProfile: GoogleProfile = {
	email: sharedEmail,
	email_verified: true,
	name: "Google Test User",
	picture: "https://example.com/photo.jpg",
	exp: 1234567890,
	sub: sharedAccountId,
	iat: 1234567890,
	aud: "test",
	azp: "test",
	nbf: 1234567890,
	iss: "https://accounts.google.com",
	locale: "en",
	jti: "test-jti",
	given_name: "Google",
	family_name: "User",
};

const server = setupServer();

beforeAll(() => {
	server.listen({ onUnhandledRequest: "bypass" });
	server.use(
		http.post("https://oauth2.googleapis.com/token", async () => {
			const idToken = await signJWT(googleProfile, DEFAULT_SECRET);
			return HttpResponse.json({
				access_token: "google-access-token",
				refresh_token: "google-refresh-token",
				id_token: idToken,
			});
		}),
		http.post("https://github.com/login/oauth/access_token", async () => {
			return HttpResponse.json({
				access_token: "github-access-token",
				token_type: "bearer",
				scope: "read:user,user:email",
			});
		}),
		http.get("https://api.github.com/user", async () => {
			return HttpResponse.json(githubProfile);
		}),
		http.get("https://api.github.com/user/emails", async () => {
			return HttpResponse.json([
				{
					email: sharedEmail,
					primary: true,
					verified: true,
					visibility: "public",
				},
			]);
		}),
	);
});

afterEach(() => {
	server.resetHandlers();
	server.use(
		http.post("https://oauth2.googleapis.com/token", async () => {
			const idToken = await signJWT(googleProfile, DEFAULT_SECRET);
			return HttpResponse.json({
				access_token: "google-access-token",
				refresh_token: "google-refresh-token",
				id_token: idToken,
			});
		}),
		http.post("https://github.com/login/oauth/access_token", async () => {
			return HttpResponse.json({
				access_token: "github-access-token",
				token_type: "bearer",
				scope: "read:user,user:email",
			});
		}),
		http.get("https://api.github.com/user", async () => {
			return HttpResponse.json(githubProfile);
		}),
		http.get("https://api.github.com/user/emails", async () => {
			return HttpResponse.json([
				{
					email: sharedEmail,
					primary: true,
					verified: true,
					visibility: "public",
				},
			]);
		}),
	);
});

afterAll(() => server.close());

describe("callback route account linking", async () => {
	const { auth, client, signInWithTestUser } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
			github: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ["google", "github"],
			},
		},
	});

	const ctx = await auth.$context;

	async function linkProvider(provider: "google" | "github", headers: Headers) {
		const linkAccountRes = await client.linkSocial(
			{
				provider,
				callbackURL: "/callback",
			},
			{
				onSuccess(context) {
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					headers.set(
						"cookie",
						`better-auth.state=${cookies.get("better-auth.state")?.value}`,
					);
				},
			},
		);

		const state =
			linkAccountRes.data && "url" in linkAccountRes.data
				? new URL(linkAccountRes.data.url).searchParams.get("state") || ""
				: "";

		await client.$fetch(`/callback/${provider}`, {
			query: {
				state,
				code: `${provider}-code`,
			},
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				expect(context.response.headers.get("location")).toContain("/callback");
			},
		});
	}

	it("creates a second linked account when providers share the same external id", async () => {
		const firstSession = await signInWithTestUser();

		await firstSession.runWithUser(async (headers) => {
			await linkProvider("google", headers);
		});

		const secondSession = await signInWithTestUser();

		await secondSession.runWithUser(async (headers) => {
			await linkProvider("github", headers);
		});

		const linkedAccounts = (
			await ctx.internalAdapter.findAccounts(firstSession.user.id)
		)
			.filter(
				(account) =>
					account.providerId === "google" || account.providerId === "github",
			)
			.sort((left, right) => left.providerId.localeCompare(right.providerId));

		expect(linkedAccounts).toHaveLength(2);
		expect(linkedAccounts.map((account) => account.providerId)).toEqual([
			"github",
			"google",
		]);
		expect(linkedAccounts.map((account) => account.accountId)).toEqual([
			sharedAccountId,
			sharedAccountId,
		]);
	});
});
