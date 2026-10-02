import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { github } from "./github";

const mockedBetterFetch = vi.mocked(betterFetch);

const CLIENT_ID = "github-client-id";
const CLIENT_SECRET = "github-client-secret";

function tokenResponse() {
	return {
		data: {
			access_token: "access-token",
			token_type: "bearer",
			scope: "read:user,user:email",
		},
		error: null,
	} as Awaited<ReturnType<typeof betterFetch>>;
}

function profileResponse<T>(profile: T) {
	return { data: profile, error: null } as Awaited<
		ReturnType<typeof betterFetch>
	>;
}

/**
 * @see https://docs.github.com/en/enterprise-cloud@latest/admin/configuration/configuring-your-enterprise/about-custom-subdomains
 */
describe.each([
	{ label: "default host (github.com)", hostName: undefined, host: "github.com" },
	{
		label: "configured GitHub Enterprise host (acme.ghe.com)",
		hostName: "acme.ghe.com",
		host: "acme.ghe.com",
	},
])("github hostName configuration - $label", ({ hostName, host }) => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("builds the authorization URL against the configured host", async () => {
		const provider = github({
			clientId: CLIENT_ID,
			clientSecret: CLIENT_SECRET,
			hostName,
		});

		const url = await provider.createAuthorizationURL({
			state: "state-xyz",
			codeVerifier: "verifier",
			redirectURI: "https://app.example.com/api/auth/callback/github",
		});

		expect(url.origin).toBe(`https://${host}`);
		expect(url.pathname).toBe("/login/oauth/authorize");
	});

	it("exchanges the authorization code against the configured host", async () => {
		mockedBetterFetch.mockResolvedValueOnce(tokenResponse());

		const provider = github({
			clientId: CLIENT_ID,
			clientSecret: CLIENT_SECRET,
			hostName,
		});

		const tokens = await provider.validateAuthorizationCode({
			code: "authorization-code",
			redirectURI: "https://app.example.com/api/auth/callback/github",
		});

		expect(tokens?.accessToken).toBe("access-token");
		const [url] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe(`https://${host}/login/oauth/access_token`);
	});

	it("refreshes the access token against the configured host", async () => {
		mockedBetterFetch.mockResolvedValueOnce(tokenResponse());

		const provider = github({
			clientId: CLIENT_ID,
			clientSecret: CLIENT_SECRET,
			hostName,
		});

		const tokens = await provider.refreshAccessToken?.("refresh-token");

		expect(tokens?.accessToken).toBe("access-token");
		const [url] = mockedBetterFetch.mock.calls[0] ?? [];
		expect(url).toBe(`https://${host}/login/oauth/access_token`);
	});

	it("fetches the user profile and emails from the configured API host", async () => {
		mockedBetterFetch
			.mockResolvedValueOnce(
				profileResponse({
					id: "github-user-1",
					login: "octocat",
					name: "Octo Cat",
					email: null,
					avatar_url: "https://example.com/avatar.png",
				}),
			)
			.mockResolvedValueOnce(
				profileResponse([
					{
						email: "octocat@example.com",
						primary: true,
						verified: true,
						visibility: "public",
					},
				]),
			);

		const provider = github({
			clientId: CLIENT_ID,
			clientSecret: CLIENT_SECRET,
			hostName,
		});

		const result = await provider.getUserInfo({
			accessToken: "access-token",
		} as any);

		expect(result?.user.email).toBe("octocat@example.com");
		expect(result?.user.emailVerified).toBe(true);

		const [profileUrl] = mockedBetterFetch.mock.calls[0] ?? [];
		const [emailsUrl] = mockedBetterFetch.mock.calls[1] ?? [];
		expect(profileUrl).toBe(`https://api.${host}/user`);
		expect(emailsUrl).toBe(`https://api.${host}/user/emails`);
	});
});
