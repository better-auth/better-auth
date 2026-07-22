import { describe, expect, it, vi } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import type { GenericOAuthConfig } from "../../plugins/generic-oauth";
import { genericOAuth } from "../../plugins/generic-oauth";
import { getTestInstance } from "../../test-utils/test-instance";

describe("sign-out", async () => {
	const afterSessionDeleted = vi.fn();
	const { signInWithTestUser, client } = await getTestInstance({
		databaseHooks: {
			session: {
				delete: {
					after: afterSessionDeleted,
				},
			},
		},
	});

	it("should sign out", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const res = await client.signOut();
			expect(res.data).toMatchObject({
				success: true,
			});

			expect(afterSessionDeleted).toHaveBeenCalled();
		});
	});

	it("should clear local session cookie when reading the session fails", async () => {
		const instance = await getTestInstance();
		const { headers } = await instance.signInWithTestUser();
		const context = await instance.auth.$context;
		vi.spyOn(context.internalAdapter, "findSession").mockRejectedValueOnce(
			new Error("database unavailable"),
		);
		let setCookieHeader = "";

		const res = await instance.client.signOut({
			fetchOptions: {
				headers,
				onSuccess(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
				},
			},
		});

		expect(res.data).toEqual({
			success: true,
		});
		const cookies = parseSetCookieHeader(setCookieHeader);
		expect(cookies.get("better-auth.session_token")?.value).toBe("");
		expect(cookies.get("better-auth.session_token")?.["max-age"]).toBe(0);
	});

	const baseOAuthConfig = {
		providerId: "oidc-provider",
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
		authorizationUrl: "https://idp.example.com/authorize",
		tokenUrl: "https://idp.example.com/token",
		userInfoUrl: "https://idp.example.com/userinfo",
	} satisfies GenericOAuthConfig;

	async function setupGenericOAuthSignOut(
		config: Partial<GenericOAuthConfig> = {},
		options: Parameters<typeof getTestInstance>[0] = {},
	) {
		const instance = await getTestInstance({
			...options,
			plugins: [
				genericOAuth({
					config: [
						{
							...baseOAuthConfig,
							...config,
						},
					],
				}),
				...(options?.plugins || []),
			],
		});
		const { headers, user } = await instance.signInWithTestUser();
		const context = await instance.auth.$context;
		await context.internalAdapter.createAccount({
			userId: user.id,
			providerId: baseOAuthConfig.providerId,
			issuer: "local:oauth:oidc-provider",
			providerAccountId: "oauth-user",
			idToken: "id-token",
		});
		return {
			...instance,
			headers,
			user,
		};
	}

	it("should return provider logout url with id_token_hint", async () => {
		const { client, headers } = await setupGenericOAuthSignOut({
			endSessionEndpoint: "https://idp.example.com/logout",
		});

		const res = await client.signOut({
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toMatchObject({
			success: true,
			redirect: true,
			url: expect.stringContaining("https://idp.example.com/logout"),
		});
		expect(new URL(res.data!.url!).searchParams.get("id_token_hint")).toBe(
			"id-token",
		);
	});

	it("should keep local-only sign out when provider has no logout endpoint", async () => {
		const { client, headers } = await setupGenericOAuthSignOut();

		const res = await client.signOut({
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toEqual({
			success: true,
		});
	});

	it("should keep local-only sign out when provider logout is disabled", async () => {
		const { client, headers } = await setupGenericOAuthSignOut({
			endSessionEndpoint: "https://idp.example.com/logout",
			disableProviderLogout: true,
		});

		const res = await client.signOut({
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toEqual({
			success: true,
		});
	});

	it("should include callbackURL as post_logout_redirect_uri with state", async () => {
		const { client, headers } = await setupGenericOAuthSignOut({
			endSessionEndpoint: "https://idp.example.com/logout",
		});

		const res = await client.signOut({
			callbackURL: "/login",
			state: "logout-state",
			fetchOptions: {
				headers,
			},
		});

		const logoutUrl = new URL(res.data!.url!);
		expect(logoutUrl.searchParams.get("post_logout_redirect_uri")).toBe(
			"http://localhost:3000/login",
		);
		expect(logoutUrl.searchParams.get("client_id")).toBe("test-client-id");
		expect(logoutUrl.searchParams.get("state")).toBe("logout-state");
	});

	it("should reject untrusted callbackURL", async () => {
		const { client, headers } = await setupGenericOAuthSignOut(
			{
				endSessionEndpoint: "https://idp.example.com/logout",
			},
			{
				trustedOrigins: ["http://localhost:3000"],
				advanced: {
					disableOriginCheck: false,
				},
			},
		);
		headers.set("origin", "http://localhost:3000");

		const res = await client.signOut({
			callbackURL: "https://evil.example.com/logout",
			fetchOptions: {
				headers,
			},
		});

		expect(res.error).toMatchObject({
			status: 403,
			message: "Invalid callbackURL",
		});
	});

	it("should return provider logout url without redirect when disabled", async () => {
		const { client, headers } = await setupGenericOAuthSignOut({
			endSessionEndpoint: "https://idp.example.com/logout",
		});

		const res = await client.signOut({
			disableRedirect: true,
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toMatchObject({
			success: true,
			redirect: false,
			url: expect.stringContaining("https://idp.example.com/logout"),
		});
	});

	it("should use the most recently updated provider when multiple linked accounts exist", async () => {
		const secondProviderConfig = {
			...baseOAuthConfig,
			providerId: "second-provider",
			endSessionEndpoint: "https://idp2.example.com/logout",
		} satisfies GenericOAuthConfig;
		const instance = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							...baseOAuthConfig,
							endSessionEndpoint: "https://idp.example.com/logout",
						},
						secondProviderConfig,
					],
				}),
			],
		});
		const { headers, user } = await instance.signInWithTestUser();
		const context = await instance.auth.$context;
		await context.internalAdapter.createAccount({
			userId: user.id,
			providerId: baseOAuthConfig.providerId,
			issuer: "local:oauth:oidc-provider",
			providerAccountId: "oauth-user",
			idToken: "id-token-first",
			updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		});
		await context.internalAdapter.createAccount({
			userId: user.id,
			providerId: secondProviderConfig.providerId,
			issuer: "local:oauth:second-provider",
			providerAccountId: "oauth-user-2",
			idToken: "id-token-second",
			updatedAt: new Date("2026-01-02T00:00:00.000Z"),
		});

		const res = await instance.client.signOut({
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toMatchObject({
			success: true,
			redirect: true,
			url: expect.stringContaining("https://idp2.example.com/logout"),
		});
	});
});
