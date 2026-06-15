import { BASE_ERROR_CODES } from "@better-auth/core/error";
import type {
	CognitoProfile,
	GoogleProfile,
} from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { MockInstance } from "vitest";
import {
	afterAll,
	afterEach,
	assert,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { betterAuth } from "../../auth/minimal";
import { parseSetCookieHeader } from "../../cookies";
import { signJWT, symmetricDecodeJWT } from "../../crypto";
import { genericOAuth } from "../../plugins/generic-oauth";
import { getTestInstance } from "../../test-utils/test-instance";
import type { Account } from "../../types";
import { DEFAULT_SECRET } from "../../utils/constants";

let email = "";
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	handlers = [
		http.post("https://oauth2.googleapis.com/token", async () => {
			const data: GoogleProfile = {
				email,
				email_verified: true,
				name: "First Last",
				picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
				exp: 1234567890,
				sub: "1234567890",
				iat: 1234567890,
				aud: "test",
				azp: "test",
				nbf: 1234567890,
				iss: "test",
				locale: "en",
				jti: "test",
				given_name: "First",
				family_name: "Last",
			};
			const testIdToken = await signJWT(data, DEFAULT_SECRET);
			return HttpResponse.json({
				access_token: "test",
				refresh_token: "test",
				id_token: testIdToken,
			});
		}),
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	vi.useRealTimers();
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("account", async () => {
	const { auth, signInWithTestUser, client } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
			},
		},
		account: {
			accountLinking: {
				allowDifferentEmails: true,
			},
			encryptOAuthTokens: true,
		},
	});

	const ctx = await auth.$context;

	let googleVerifyIdTokenMock: MockInstance;
	let googleGetUserInfoMock: MockInstance;
	beforeAll(() => {
		const googleProvider = ctx.socialProviders.find((v) => v.id === "google")!;
		expect(googleProvider).toBeTruthy();

		googleVerifyIdTokenMock = vi.spyOn(googleProvider, "verifyIdToken");
		googleGetUserInfoMock = vi.spyOn(googleProvider, "getUserInfo");
	});

	afterEach(() => {
		googleVerifyIdTokenMock.mockClear();
		googleGetUserInfoMock.mockClear();
	});

	const { runWithUser } = await signInWithTestUser();

	it("should list all accounts", async () => {
		await runWithUser(async () => {
			const accounts = await client.listAccounts();
			expect(accounts.data?.length).toBe(1);
		});
	});

	it("should link first account", async () => {
		await runWithUser(async (headers) => {
			const linkAccountRes = await client.linkSocial(
				{
					provider: "google",
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
			expect(linkAccountRes.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			const state =
				linkAccountRes.data && "url" in linkAccountRes.data
					? new URL(linkAccountRes.data.url).searchParams.get("state") || ""
					: "";
			email = "test@test.com";
			await client.$fetch("/callback/google", {
				query: {
					state,
					code: "test",
				},
				method: "GET",
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toBeDefined();
					expect(location).toContain("/callback");
				},
			});
		});
		const { runWithUser: runWithClient2 } = await signInWithTestUser();
		await runWithClient2(async () => {
			const accounts = await client.listAccounts();
			expect(accounts.data?.length).toBe(2);
		});
	});

	it("should encrypt access token and refresh token", async () => {
		const { runWithUser: runWithClient2 } = await signInWithTestUser();
		const account = await ctx.adapter.findOne<Account>({
			model: "account",
			where: [{ field: "providerId", value: "google" }],
		});
		expect(account).toBeTruthy();
		expect(account?.accessToken).not.toBe("test");
		await runWithClient2(async () => {
			const accessToken = await client.getAccessToken({
				providerId: "google",
			});
			expect(accessToken.data?.accessToken).toBe("test");
		});
	});

	it("should get access token using accountId from listAccounts", async () => {
		const { runWithUser: runWithClient2 } = await signInWithTestUser();
		await runWithClient2(async () => {
			const accounts = await client.listAccounts();
			const googleAccount = accounts.data?.find(
				(a) => a.providerId === "google",
			);
			expect(googleAccount).toBeDefined();
			expect(googleAccount?.accountId).toBeDefined();

			// Use accountId from listAccounts to get access token
			const accessToken = await client.getAccessToken({
				providerId: "google",
				accountId: googleAccount!.accountId,
			});

			expect(accessToken.error).toBeNull();
			expect(accessToken.data?.accessToken).toBe("test");
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8345
	 */
	it("should get account info using provider accountId (not internal id)", async () => {
		const { runWithUser: runWithClient2 } = await signInWithTestUser();
		await runWithClient2(async () => {
			const accounts = await client.listAccounts();
			const googleAccount = accounts.data?.find(
				(a) => a.providerId === "google",
			);
			expect(googleAccount).toBeDefined();

			// The internal DB id must differ from the provider-issued accountId
			expect(googleAccount!.id).not.toBe(googleAccount!.accountId);

			// accountInfo internally calls getAccessToken with account.accountId.
			// Before the fix, it incorrectly passed account.id (internal DB id),
			// causing getAccessToken to fail the account lookup.
			const info = await client.$fetch("/account-info", {
				query: { accountId: googleAccount!.accountId },
				method: "GET",
			});

			expect(info.data).toMatchObject({
				user: expect.objectContaining({
					id: expect.any(String),
					email: expect.any(String),
				}),
				data: expect.any(Object),
			});
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8350
	 */
	it("should get account info server-side using userId without session headers", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: { clientId: "test", clientSecret: "test", enabled: true },
			},
		});

		const headers = new Headers();
		email = "account-info-server-side@test.com";
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: { onSuccess: cookieSetter(headers) },
		});
		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";
		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			headers,
			method: "GET",
			onError(context) {
				cookieSetter(headers)({ response: context.response });
			},
		});

		const accounts = await auth.api.listUserAccounts({ headers });
		const googleAccount = accounts.find((a) => a.providerId === "google");
		expect(googleAccount).toBeTruthy();

		// No headers: the server-side caller identifies the user via userId.
		const info = await auth.api.accountInfo({
			query: {
				accountId: googleAccount!.accountId,
				userId: googleAccount!.userId,
			},
		});

		expect(info).toMatchObject({
			user: expect.objectContaining({
				id: expect.any(String),
				email: expect.any(String),
			}),
			data: expect.any(Object),
		});
	});

	it("should reject account info over HTTP without a session even when userId is passed", async () => {
		const { user } = await signInWithTestUser();
		// Top-level $fetch carries no session; a passed userId must not bypass auth.
		const info = await client.$fetch("/account-info", {
			query: { accountId: "any-account-id", userId: user.id },
			method: "GET",
		});
		expect(info.data).toBeNull();
		expect(info.error?.status).toBe(401);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9502
	 */
	it("should resolve account info from the current user's accounts when provider account IDs collide", async () => {
		const { auth, signInWithTestUser, client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			account: {
				accountLinking: {
					allowDifferentEmails: true,
				},
				encryptOAuthTokens: true,
			},
		});
		const ctx = await auth.$context;
		const googleProvider = ctx.socialProviders.find((v) => v.id === "google")!;
		const getUserInfoMock = vi.spyOn(googleProvider, "getUserInfo");
		const sharedAccountId = "shared-provider-account-id";
		const otherUser = await ctx.internalAdapter.createUser({
			name: "Other User",
			email: "other-account-info@example.com",
		});
		await ctx.internalAdapter.createAccount({
			userId: otherUser.id,
			providerId: "google",
			accountId: sharedAccountId,
			accessToken: "other-access-token",
		});

		const { runWithUser, user } = await signInWithTestUser();
		await ctx.internalAdapter.createAccount({
			userId: user.id,
			providerId: "google",
			accountId: sharedAccountId,
			accessToken: "current-access-token",
		});

		getUserInfoMock.mockResolvedValueOnce({
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				emailVerified: user.emailVerified,
			},
			data: { source: "current-user" },
		});

		await runWithUser(async () => {
			const info = await client.$fetch("/account-info", {
				query: { accountId: sharedAccountId },
				method: "GET",
			});

			expect(info.error).toBeNull();
			expect(info.data).toMatchObject({
				data: { source: "current-user" },
			});
			expect(getUserInfoMock).toHaveBeenCalledWith(
				expect.objectContaining({ accessToken: "current-access-token" }),
			);
		});
	});

	it("should require providerId when a current user's provider account IDs collide", async () => {
		const { auth, signInWithTestUser, client } = await getTestInstance({
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
					allowDifferentEmails: true,
				},
			},
		});
		const ctx = await auth.$context;
		const googleProvider = ctx.socialProviders.find((v) => v.id === "google")!;
		const githubProvider = ctx.socialProviders.find((v) => v.id === "github")!;
		const googleGetUserInfoMock = vi.spyOn(googleProvider, "getUserInfo");
		const githubGetUserInfoMock = vi.spyOn(githubProvider, "getUserInfo");
		const sharedAccountId = "shared-provider-account-id";

		const { runWithUser, user } = await signInWithTestUser();
		await ctx.internalAdapter.createAccount({
			userId: user.id,
			providerId: "google",
			accountId: sharedAccountId,
			accessToken: "google-access-token",
		});
		await ctx.internalAdapter.createAccount({
			userId: user.id,
			providerId: "github",
			accountId: sharedAccountId,
			accessToken: "github-access-token",
		});

		await runWithUser(async () => {
			const ambiguousInfo = await client.$fetch("/account-info", {
				query: { accountId: sharedAccountId },
				method: "GET",
			});

			expect(ambiguousInfo.error?.message).toBe(
				"Multiple accounts share this account ID. Pass a providerId to disambiguate.",
			);
			expect(googleGetUserInfoMock).not.toHaveBeenCalled();
			expect(githubGetUserInfoMock).not.toHaveBeenCalled();

			githubGetUserInfoMock.mockResolvedValueOnce({
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					emailVerified: user.emailVerified,
				},
				data: { source: "github" },
			});
			const githubInfo = await client.$fetch("/account-info", {
				query: { accountId: sharedAccountId, providerId: "github" },
				method: "GET",
			});

			expect(githubInfo.error).toBeNull();
			expect(githubInfo.data).toMatchObject({
				data: { source: "github" },
			});
			expect(githubGetUserInfoMock).toHaveBeenCalledWith(
				expect.objectContaining({ accessToken: "github-access-token" }),
			);
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9502
	 */
	it("should disambiguate by providerId on the server-side userId path without a session", async () => {
		const { auth } = await getTestInstance({
			socialProviders: {
				google: { clientId: "test", clientSecret: "test", enabled: true },
				github: { clientId: "test", clientSecret: "test", enabled: true },
			},
			account: {
				accountLinking: {
					allowDifferentEmails: true,
				},
			},
		});
		const ctx = await auth.$context;
		const githubProvider = ctx.socialProviders.find((v) => v.id === "github")!;
		const githubGetUserInfoMock = vi.spyOn(githubProvider, "getUserInfo");
		const sharedAccountId = "shared-server-side-account-id";

		const user = await ctx.internalAdapter.createUser({
			name: "Server Side User",
			email: "server-side-disambiguate@example.com",
		});
		await ctx.internalAdapter.createAccount({
			userId: user.id,
			providerId: "google",
			accountId: sharedAccountId,
			accessToken: "google-access-token",
		});
		await ctx.internalAdapter.createAccount({
			userId: user.id,
			providerId: "github",
			accountId: sharedAccountId,
			accessToken: "github-access-token",
		});

		githubGetUserInfoMock.mockResolvedValueOnce({
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				emailVerified: user.emailVerified,
			},
			data: { source: "github" },
		});

		// No headers: the trusted server-side caller names the user via userId,
		// and providerId disambiguates the colliding accountId.
		const info = await auth.api.accountInfo({
			query: {
				accountId: sharedAccountId,
				userId: user.id,
				providerId: "github",
			},
		});

		expect(info).toMatchObject({ data: { source: "github" } });
		expect(githubGetUserInfoMock).toHaveBeenCalledWith(
			expect.objectContaining({ accessToken: "github-access-token" }),
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9502
	 */
	it("should not find an account when providerId matches none of the user's accounts", async () => {
		const { auth, signInWithTestUser, client } = await getTestInstance({
			socialProviders: {
				google: { clientId: "test", clientSecret: "test", enabled: true },
				github: { clientId: "test", clientSecret: "test", enabled: true },
			},
			account: {
				accountLinking: {
					allowDifferentEmails: true,
				},
			},
		});
		const ctx = await auth.$context;
		const accountId = "github-only-account-id";

		const { runWithUser, user } = await signInWithTestUser();
		await ctx.internalAdapter.createAccount({
			userId: user.id,
			providerId: "github",
			accountId,
			accessToken: "github-access-token",
		});

		await runWithUser(async () => {
			const info = await client.$fetch("/account-info", {
				query: { accountId, providerId: "google" },
				method: "GET",
			});

			expect(info.error?.message).toBe(
				BASE_ERROR_CODES.ACCOUNT_NOT_FOUND.message,
			);
		});
	});

	it("should reject account info for a non-social (credential) account", async () => {
		// A credential account stores its accountId as the user id. Asking for its
		// provider info is a client error (400), not a server error (500).
		const { runWithUser, user } = await signInWithTestUser();
		await runWithUser(async () => {
			const info = await client.$fetch("/account-info", {
				query: { accountId: user.id },
				method: "GET",
			});

			expect(info.error?.status).toBe(400);
			expect(info.error?.message).toBe(
				"Account is not associated with a configured social provider.",
			);
		});
	});

	it("should pass custom scopes to authorization URL", async () => {
		const { runWithUser: runWithClient2 } = await signInWithTestUser();
		await runWithClient2(async () => {
			const customScope = "https://www.googleapis.com/auth/drive.readonly";
			const linkAccountRes = await client.linkSocial({
				provider: "google",
				callbackURL: "/callback",
				scopes: [customScope],
			});

			expect(linkAccountRes.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});

			const url =
				linkAccountRes.data && "url" in linkAccountRes.data
					? new URL(linkAccountRes.data.url)
					: new URL("");
			const scopesParam = url.searchParams.get("scope");
			expect(scopesParam).toContain(customScope);
		});
	});

	it("should link second account from the same provider", async () => {
		const { runWithUser: runWithClient2 } = await signInWithTestUser();
		await runWithClient2(async (headers) => {
			const linkAccountRes = await client.linkSocial(
				{
					provider: "google",
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
			expect(linkAccountRes.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			const state =
				linkAccountRes.data && "url" in linkAccountRes.data
					? new URL(linkAccountRes.data.url).searchParams.get("state") || ""
					: "";
			email = "test2@test.com";
			await client.$fetch("/callback/google", {
				query: {
					state,
					code: "test",
				},
				method: "GET",
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toBeDefined();
					expect(location).toContain("/callback");
				},
			});
		});

		const { runWithUser: runWithClient3 } = await signInWithTestUser();
		await runWithClient3(async () => {
			const accounts = await client.listAccounts();
			expect(accounts.data?.length).toBe(2);
		});
	});

	it("should link third account with idToken", async () => {
		googleVerifyIdTokenMock.mockResolvedValueOnce(true);
		const user = {
			id: "0987654321",
			name: "test2",
			email: "test2@gmail.com",
			sub: "test2",
			emailVerified: true,
		};
		const userInfo = {
			user,
			data: user,
		};
		googleGetUserInfoMock.mockResolvedValueOnce(userInfo);

		const { runWithUser: runWithClient2 } = await signInWithTestUser();
		await runWithClient2(async (headers) => {
			await client.linkSocial(
				{
					provider: "google",
					callbackURL: "/callback",
					idToken: { token: "test" },
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
		});

		expect(googleVerifyIdTokenMock).toHaveBeenCalledOnce();
		expect(googleGetUserInfoMock).toHaveBeenCalledOnce();

		const { runWithUser: runWithClient3 } = await signInWithTestUser();
		await runWithClient3(async () => {
			const accounts = await client.listAccounts();
			expect(accounts.data?.length).toBe(3);
		});
	});

	it("should unlink account", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const previousAccounts = await client.listAccounts();
			expect(previousAccounts.data?.length).toBe(3);
			const unlinkAccountId = previousAccounts.data![1]!.accountId;
			const unlinkRes = await client.unlinkAccount({
				providerId: "google",
				accountId: unlinkAccountId!,
			});
			expect(unlinkRes.data?.status).toBe(true);
			const accounts = await client.listAccounts();
			expect(accounts.data?.length).toBe(2);
		});
	});

	it("should fail to unlink the last account of a provider", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const previousAccounts = await client.listAccounts();
			await ctx.adapter.delete({
				model: "account",
				where: [
					{
						field: "providerId",
						value: "google",
					},
				],
			});
			const unlinkAccountId = previousAccounts.data![0]!.accountId;
			const unlinkRes = await client.unlinkAccount({
				providerId: "credential",
				accountId: unlinkAccountId,
			});
			expect(unlinkRes.error?.message).toBe(
				BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT.message,
			);
		});
	});

	it("should unlink account with specific accountId", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const previousAccounts = await client.listAccounts();
			expect(previousAccounts.data?.length).toBeGreaterThan(0);

			const accountToUnlink = previousAccounts.data![0]!;
			const unlinkAccountId = accountToUnlink.accountId;
			const providerId = accountToUnlink.providerId;
			const accountsWithSameProvider = previousAccounts.data!.filter(
				(account) => account.providerId === providerId,
			);
			if (accountsWithSameProvider.length <= 1) {
				return;
			}

			const unlinkRes = await client.unlinkAccount({
				providerId,
				accountId: unlinkAccountId!,
			});

			expect(unlinkRes.data?.status).toBe(true);

			const accountsAfterUnlink = await client.listAccounts();

			expect(accountsAfterUnlink.data?.length).toBe(
				previousAccounts.data!.length - 1,
			);
			expect(
				accountsAfterUnlink.data?.find((a) => a.accountId === unlinkAccountId),
			).toBeUndefined();
		});
	});

	it("should unlink all accounts with specific providerId", async () => {
		const { runWithUser, user } = await signInWithTestUser();
		await ctx.adapter.create({
			model: "account",
			data: {
				providerId: "google",
				accountId: "123",
				userId: user.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await ctx.adapter.create({
			model: "account",
			data: {
				providerId: "google",
				accountId: "345",
				userId: user.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await runWithUser(async () => {
			const previousAccounts = await client.listAccounts();

			const googleAccounts = previousAccounts.data!.filter(
				(account) => account.providerId === "google",
			);
			expect(googleAccounts.length).toBeGreaterThan(1);

			for (let i = 0; i < googleAccounts.length - 1; i++) {
				const unlinkRes = await client.unlinkAccount({
					providerId: "google",
					accountId: googleAccounts[i]!.accountId!,
				});
				expect(unlinkRes.data?.status).toBe(true);
			}

			const accountsAfterUnlink = await client.listAccounts();

			const remainingGoogleAccounts = accountsAfterUnlink.data!.filter(
				(account) => account.providerId === "google",
			);
			expect(remainingGoogleAccounts.length).toBe(1);
		});
	});

	it("should store account data cookie after oauth flow and retrieve it through getAccessToken", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			account: {
				storeAccountCookie: true,
			},
		});

		const ctx = await auth.$context;
		const accountDataCookieName = ctx.authCookies.accountData.name;

		const headers = new Headers();
		email = "oauth-test@test.com";

		// Start OAuth sign-in flow
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		// Complete OAuth callback
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain("/callback");

				// Verify account data cookie is set
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				const accountDataCookie = cookies.get(accountDataCookieName);
				expect(accountDataCookie).toBeDefined();
				expect(accountDataCookie?.value).toBeDefined();

				// Set all cookies including account data cookie
				cookieSetter(headers)({ response: context.response });
			},
		});
		const accessTokenRes = await client.getAccessToken(
			{
				providerId: "google",
			},
			{
				headers,
			},
		);

		expect(accessTokenRes.data).toBeDefined();
		expect(accessTokenRes.data?.accessToken).toBe("test");
	});

	it("should use account cookie when accountId is omitted in getAccessToken", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			account: {
				storeAccountCookie: true,
			},
		});

		const testCtx = await auth.$context;
		const headers = new Headers();
		email = "account-cookie-match@test.com";

		// Start OAuth sign-in flow
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		// Complete OAuth callback
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(headers)({ response: context.response });
			},
		});

		// Spy on findAccounts to verify cookie path is used (no DB fallback)
		const findAccountsSpy = vi.spyOn(testCtx.internalAdapter, "findAccounts");

		const accessTokenRes = await client.getAccessToken(
			{
				providerId: "google",
			},
			{
				headers,
			},
		);

		expect(accessTokenRes.data?.accessToken).toBe("test");
		// Cookie should have matched directly, no DB lookup needed
		expect(findAccountsSpy).not.toHaveBeenCalled();
		findAccountsSpy.mockRestore();
	});

	it("should match account cookie by accountId in getAccessToken when accountId is provided", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			account: {
				storeAccountCookie: true,
			},
		});

		const testCtx = await auth.$context;
		const headers = new Headers();
		email = "account-cookie-accountid@test.com";

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(headers)({ response: context.response });
			},
		});

		// Get the provider accountId from the cookie/DB
		const accounts = await client.listAccounts({
			fetchOptions: { headers },
		});
		const googleAccount = accounts.data?.find((a) => a.providerId === "google");
		assert(googleAccount, "google account should exist");
		// Internal id and provider accountId must differ
		assert(googleAccount.id !== googleAccount.accountId);

		const findAccountsSpy = vi.spyOn(testCtx.internalAdapter, "findAccounts");

		// Pass explicit accountId (provider-issued) - this should match cookie
		const accessTokenRes = await client.getAccessToken(
			{
				providerId: "google",
				accountId: googleAccount.accountId,
			},
			{
				headers,
			},
		);

		expect(accessTokenRes.data?.accessToken).toBe("test");
		// Cookie should have matched by accountId, no DB fallback
		expect(findAccountsSpy).not.toHaveBeenCalled();
		findAccountsSpy.mockRestore();
	});

	it("should not refresh with a stale account cookie belonging to another user", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			account: {
				storeAccountCookie: true,
			},
		});
		const testCtx = await auth.$context;

		let refreshedWith: string | null = null;
		server.use(
			http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
				const params = new URLSearchParams(await request.text());
				if (params.get("grant_type") === "refresh_token") {
					refreshedWith = params.get("refresh_token");
					// the provider does not rotate the refresh token
					return HttpResponse.json({
						access_token: "rotated-access-token",
					});
				}
				const data: GoogleProfile = {
					email,
					email_verified: true,
					name: "First User",
					picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
					exp: 1234567890,
					sub: "first-google-sub",
					iat: 1234567890,
					aud: "test",
					azp: "test",
					nbf: 1234567890,
					iss: "test",
					locale: "en",
					jti: "test",
					given_name: "First",
					family_name: "User",
				};
				const testIdToken = await signJWT(data, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "first-access-token",
					refresh_token: "first-refresh-token",
					id_token: testIdToken,
				});
			}),
		);

		// The first user signs in with Google, storing their account_data cookie
		const headers = new Headers();
		email = "stale-cookie-first@test.com";
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(headers)({ response: context.response });
			},
		});

		await client.signUp.email(
			{
				email: "stale-cookie-second@test.com",
				password: "password123456",
				name: "Second User",
			},
			{
				headers,
				onSuccess: cookieSetter(headers),
			},
		);
		const session = await auth.api.getSession({ headers });
		assert(session, "second user should be signed in");
		expect(session.user.email).toBe("stale-cookie-second@test.com");

		// The second user has their own google account
		await testCtx.internalAdapter.createAccount({
			userId: session.user.id,
			providerId: "google",
			accountId: "second-google-sub",
			accessToken: "second-access-token",
			refreshToken: "second-refresh-token",
			scope: "email",
		});

		const res = await client.$fetch<{ refreshToken?: string }>(
			"/refresh-token",
			{
				body: {
					providerId: "google",
				},
				headers,
				method: "POST",
			},
		);

		// The refresh must use the second user's own refresh token, not the
		// the first user's token from the stale cookie
		expect(refreshedWith).toBe("second-refresh-token");
		expect(res.data?.refreshToken).not.toBe("first-refresh-token");

		// The second user's account row must not be overwritten with the
		// the first user's tokens
		const accounts = await testCtx.internalAdapter.findAccounts(
			session.user.id,
		);
		const googleAccount = accounts.find((a) => a.providerId === "google");
		expect(googleAccount?.refreshToken).toBe("second-refresh-token");
	});

	it("should persist refreshed idToken in database during getAccessToken auto-refresh", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			account: {
				storeAccountCookie: false,
			},
		});

		const ctx = await auth.$context;
		const headers = new Headers();
		email = "persist-id-token-db@test.com";

		const now = Math.floor(Date.now() / 1000);
		const oldIdToken = await signJWT(
			{
				email,
				email_verified: true,
				name: "First Last",
				picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
				exp: now + 3600,
				sub: "persist-id-token-db",
				iat: now,
				aud: "test",
				azp: "test",
				nbf: now,
				iss: "test",
				locale: "en",
				jti: "old-id-token",
				given_name: "First",
				family_name: "Last",
			} satisfies GoogleProfile,
			DEFAULT_SECRET,
		);
		const newIdToken = await signJWT(
			{
				email,
				email_verified: true,
				name: "First Last",
				picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
				exp: now + 7200,
				sub: "persist-id-token-db",
				iat: now,
				aud: "test",
				azp: "test",
				nbf: now,
				iss: "test",
				locale: "en",
				jti: "new-id-token",
				given_name: "First",
				family_name: "Last",
			} satisfies GoogleProfile,
			DEFAULT_SECRET,
		);

		let refreshTokenCalls = 0;
		server.use(
			http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
				const body = await request.text();
				const grantType = new URLSearchParams(body).get("grant_type");

				if (grantType === "refresh_token") {
					refreshTokenCalls += 1;
					return HttpResponse.json({
						access_token: "refreshed-access-token",
						refresh_token: "refreshed-refresh-token",
						expires_in: 3600,
						id_token: newIdToken,
					});
				}

				return HttpResponse.json({
					access_token: "initial-access-token",
					refresh_token: "initial-refresh-token",
					expires_in: 1,
					id_token: oldIdToken,
				});
			}),
		);

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(headers)({ response: context.response });
			},
		});

		const firstAccessToken = await client.getAccessToken(
			{
				providerId: "google",
			},
			{
				headers,
				onSuccess: cookieSetter(headers),
			},
		);
		expect(firstAccessToken.error).toBeFalsy();
		expect(firstAccessToken.data?.idToken).toBe(newIdToken);

		const secondAccessToken = await client.getAccessToken(
			{
				providerId: "google",
			},
			{
				headers,
			},
		);
		expect(secondAccessToken.error).toBeFalsy();
		expect(secondAccessToken.data?.idToken).toBe(newIdToken);
		expect(refreshTokenCalls).toBe(1);

		const account = await ctx.adapter.findOne<Account>({
			model: "account",
			where: [{ field: "providerId", value: "google" }],
		});
		expect(account).toBeTruthy();
		expect(account?.idToken).toBe(newIdToken);
	});

	it("should persist refreshed idToken in account cookie during getAccessToken auto-refresh in stateless mode", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			database: undefined,
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			account: {
				storeAccountCookie: true,
			},
		});
		const ctx = await auth.$context;
		const accountDataCookieName = ctx.authCookies.accountData.name;

		const headers = new Headers();
		email = "persist-id-token-cookie@test.com";

		const now = Math.floor(Date.now() / 1000);
		const oldIdToken = await signJWT(
			{
				email,
				email_verified: true,
				name: "First Last",
				picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
				exp: now + 3600,
				sub: "persist-id-token-cookie",
				iat: now,
				aud: "test",
				azp: "test",
				nbf: now,
				iss: "test",
				locale: "en",
				jti: "old-cookie-id-token",
				given_name: "First",
				family_name: "Last",
			} satisfies GoogleProfile,
			DEFAULT_SECRET,
		);
		const newIdToken = await signJWT(
			{
				email,
				email_verified: true,
				name: "First Last",
				picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
				exp: now + 7200,
				sub: "persist-id-token-cookie",
				iat: now,
				aud: "test",
				azp: "test",
				nbf: now,
				iss: "test",
				locale: "en",
				jti: "new-cookie-id-token",
				given_name: "First",
				family_name: "Last",
			} satisfies GoogleProfile,
			DEFAULT_SECRET,
		);

		let refreshTokenCalls = 0;
		server.use(
			http.post("https://oauth2.googleapis.com/token", async ({ request }) => {
				const body = await request.text();
				const grantType = new URLSearchParams(body).get("grant_type");

				if (grantType === "refresh_token") {
					refreshTokenCalls += 1;
					return HttpResponse.json({
						access_token: "refreshed-cookie-access-token",
						refresh_token: "refreshed-cookie-refresh-token",
						expires_in: 3600,
						id_token: newIdToken,
					});
				}

				return HttpResponse.json({
					access_token: "initial-cookie-access-token",
					refresh_token: "initial-cookie-refresh-token",
					expires_in: 1,
					id_token: oldIdToken,
				});
			}),
		);

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(headers)({ response: context.response });
			},
		});

		let refreshedAccountCookie: string | undefined;
		const firstAccessToken = await client.getAccessToken(
			{
				providerId: "google",
			},
			{
				headers,
				onSuccess(context) {
					cookieSetter(headers)(context);
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					refreshedAccountCookie =
						cookies.get(accountDataCookieName)?.value || undefined;
				},
			},
		);
		expect(firstAccessToken.error).toBeFalsy();
		expect(firstAccessToken.data?.idToken).toBe(newIdToken);
		expect(refreshedAccountCookie).toBeDefined();
		await expect(
			symmetricDecodeJWT(
				refreshedAccountCookie!,
				ctx.secret,
				"better-auth-account",
			),
		).resolves.toMatchObject({
			idToken: newIdToken,
		});

		const secondAccessToken = await client.getAccessToken(
			{
				providerId: "google",
			},
			{
				headers,
			},
		);
		expect(secondAccessToken.error).toBeFalsy();
		expect(secondAccessToken.data?.idToken).toBe(newIdToken);
		expect(refreshTokenCalls).toBeGreaterThan(0);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8562
	 */
	it("should preserve the Cognito refresh token when getAccessToken auto-refresh receives no replacement", async () => {
		const cognitoDomain = "test.auth.us-east-1.amazoncognito.com";
		const cognitoIssuer =
			"https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testpool";
		const signCognitoIdToken = (jti: string) => {
			const now = Math.floor(Date.now() / 1000);
			return signJWT(
				{
					email: "cognito-refresh@test.com",
					email_verified: true,
					name: "Cognito User",
					exp: now + 3600,
					sub: "cognito-user-sub",
					iat: now,
					aud: "cognito-client",
					iss: cognitoIssuer,
					jti,
				} satisfies CognitoProfile,
				DEFAULT_SECRET,
			);
		};

		const { auth, client, cookieSetter } = await getTestInstance({
			database: undefined,
			socialProviders: {
				cognito: {
					clientId: "cognito-client",
					clientSecret: "cognito-secret",
					domain: cognitoDomain,
					region: "us-east-1",
					userPoolId: "us-east-1_testpool",
				},
			},
			account: {
				storeAccountCookie: true,
			},
		});
		const authContext = await auth.$context;
		const accountDataCookieName = authContext.authCookies.accountData.name;
		const refreshGrantRefreshTokens: string[] = [];
		const initialIdToken = await signCognitoIdToken("initial-cognito-id-token");
		const refreshedIdToken = await signCognitoIdToken(
			"refreshed-cognito-id-token",
		);

		server.use(
			http.post(
				`https://${cognitoDomain}/oauth2/token`,
				async ({ request }) => {
					const params = new URLSearchParams(await request.text());
					const grantType = params.get("grant_type");

					if (grantType === "refresh_token") {
						const refreshToken = params.get("refresh_token");
						refreshGrantRefreshTokens.push(refreshToken || "");
						return HttpResponse.json({
							access_token: "refreshed-cognito-access-token",
							expires_in: 3600,
							id_token: refreshedIdToken,
							token_type: "Bearer",
						});
					}

					return HttpResponse.json({
						access_token: "initial-cognito-access-token",
						expires_in: 1,
						id_token: initialIdToken,
						refresh_token: "cognito-refresh-token",
						token_type: "Bearer",
					});
				},
			),
		);

		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "cognito",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining(cognitoDomain),
			redirect: true,
		});
		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		await client.$fetch("/callback/cognito", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(headers)({ response: context.response });
			},
		});

		let refreshedAccountCookie: string | undefined;
		const accessTokenResponse = await client.getAccessToken(
			{
				providerId: "cognito",
			},
			{
				headers,
				onSuccess(context) {
					cookieSetter(headers)(context);
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					refreshedAccountCookie =
						cookies.get(accountDataCookieName)?.value || undefined;
				},
			},
		);

		expect(accessTokenResponse.error).toBeFalsy();
		expect(accessTokenResponse.data?.accessToken).toBe(
			"refreshed-cognito-access-token",
		);
		expect(accessTokenResponse.data?.idToken).toBe(refreshedIdToken);
		expect(refreshGrantRefreshTokens).toEqual(["cognito-refresh-token"]);
		expect(refreshedAccountCookie).toBeDefined();
		await expect(
			symmetricDecodeJWT(
				refreshedAccountCookie!,
				authContext.secret,
				"better-auth-account",
			),
		).resolves.toMatchObject({
			accessToken: "refreshed-cognito-access-token",
			idToken: refreshedIdToken,
			refreshToken: "cognito-refresh-token",
		});

		const refreshTokenResponse = await client.$fetch<{ refreshToken?: string }>(
			"/refresh-token",
			{
				body: {
					providerId: "cognito",
				},
				headers,
				method: "POST",
			},
		);

		expect(refreshTokenResponse.error).toBeFalsy();
		expect(refreshTokenResponse.data?.refreshToken).toBe(
			"cognito-refresh-token",
		);
		expect(refreshGrantRefreshTokens).toEqual([
			"cognito-refresh-token",
			"cognito-refresh-token",
		]);
	});

	it("should NOT chunk account data cookies when exceeding 4KB", async () => {
		const { client, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			account: {
				storeAccountCookie: true,
			},
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});

		const headers = new Headers();
		email = "oauth-test@test.com";

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		// Complete OAuth callback
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			async onError(context) {
				const setCookie = context.response.headers.get("set-cookie");
				expect(setCookie).toBeDefined();

				const parsed = parseSetCookieHeader(setCookie!);
				let hasChunks = false;
				let hasSingleAccountData = false;

				parsed.forEach((_value, name) => {
					if (
						name.includes("account_data.0") ||
						name.includes("account_data.1")
					) {
						hasChunks = true;
					}
					if (name.endsWith("account_data")) {
						hasSingleAccountData = true;
					}
				});

				expect(hasChunks).toBe(false);
				expect(hasSingleAccountData).toBe(true);

				parsed.forEach((value, name) => {
					headers.append("cookie", `${name}=${value.value}`);
				});
			},
		});
		const accessTokenRes = await client.getAccessToken(
			{
				providerId: "google",
			},
			{
				headers,
			},
		);

		expect(accessTokenRes.data).toBeDefined();
		expect(accessTokenRes.data?.accessToken).toBe("test");
	});

	it("should chunk account data cookies when exceeding 4KB", async () => {
		const { client, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			account: {
				storeAccountCookie: true,
				additionalFields: {
					largeField: {
						type: "string",
						defaultValue: "x".repeat(5000), // 5KB field to exceed cookie size
					},
				},
			},
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});

		const headers = new Headers();
		email = "oauth-test@test.com";

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		// Complete OAuth callback
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			async onError(context) {
				const setCookie = context.response.headers.get("set-cookie");
				expect(setCookie).toBeDefined();

				const parsed = parseSetCookieHeader(setCookie!);
				let hasChunks = false;

				parsed.forEach((_value, name) => {
					if (
						name.includes("account_data.0") ||
						name.includes("account_data.1")
					) {
						hasChunks = true;
					}
				});

				expect(hasChunks).toBe(true);

				parsed.forEach((value, name) => {
					headers.append("cookie", `${name}=${value.value}`);
				});
			},
		});
		const accessTokenRes = await client.getAccessToken(
			{
				providerId: "google",
			},
			{
				headers,
			},
		);

		expect(accessTokenRes.data).toBeDefined();
		expect(accessTokenRes.data?.accessToken).toBe("test");
	});

	it("should encrypt account cookie payload", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			account: {
				storeAccountCookie: true,
			},
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});
		const ctx = await auth.$context;

		const headers = new Headers();
		email = "oauth-test@test.com";

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		// Complete OAuth callback
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			async onError(context) {
				const setCookie = context.response.headers.get("set-cookie");
				expect(setCookie).toBeDefined();

				const parsed = parseSetCookieHeader(setCookie!);
				const accountData = parsed.get("better-auth.account_data")?.value;

				expect(accountData).toBeDefined();
				expect(accountData!.startsWith("ey")).toBe(true);
				await expect(
					symmetricDecodeJWT(accountData!, ctx.secret, "better-auth-account"),
				).resolves.toMatchObject({
					accessToken: "test",
					refreshToken: "test",
					providerId: "google",
				});
			},
		});
	});

	it("should set account cookie on re-login after sign-out when updateAccountOnSignIn is false", async () => {
		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			account: {
				storeAccountCookie: true,
				updateAccountOnSignIn: false, // important to test this scenario
			},
		});

		const ctx = await auth.$context;
		const accountDataCookieName = ctx.authCookies.accountData.name;

		const headers = new Headers();
		email = "re-login-test@test.com";

		// first login with new user
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(headers)({ response: context.response });
			},
		});

		// verify account cookie is set after first login
		const firstLoginAccessToken = await client.getAccessToken(
			{ providerId: "google" },
			{ headers },
		);
		expect(firstLoginAccessToken.error).toBeFalsy();
		expect(firstLoginAccessToken.data?.accessToken).toBe("test");

		// sign out
		await client.signOut({ fetchOptions: { headers } });

		// clear headers to simulate fresh session
		const newHeaders = new Headers();

		// re-login with same OAuth account
		const reLoginRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(newHeaders),
			},
		});

		const reLoginState =
			reLoginRes.data && "url" in reLoginRes.data && reLoginRes.data.url
				? new URL(reLoginRes.data.url).searchParams.get("state") || ""
				: "";

		let accountCookieSetOnReLogin = false;
		await client.$fetch("/callback/google", {
			query: { state: reLoginState, code: "test" },
			headers: newHeaders,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);

				// check if account_data cookie is set on re-login
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				const accountDataCookie = cookies.get(accountDataCookieName);
				accountCookieSetOnReLogin = !!accountDataCookie?.value;

				cookieSetter(newHeaders)({ response: context.response });
			},
		});

		// verify account cookie is set on re-login
		expect(accountCookieSetOnReLogin).toBe(true);

		// verify getAccessToken works after re-login
		const reLoginAccessToken = await client.getAccessToken(
			{ providerId: "google" },
			{ headers: newHeaders },
		);

		expect(reLoginAccessToken.error).toBeFalsy();
		expect(reLoginAccessToken.data?.accessToken).toBe("test");
	});

	it("should refresh account_data cookie when session is refreshed", async () => {
		const sessionExpiresIn = 60 * 60 * 24 * 7;
		const sessionUpdateAge = 10;

		const { auth, client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			account: {
				storeAccountCookie: true,
			},
			session: {
				expiresIn: sessionExpiresIn,
				updateAge: sessionUpdateAge,
				cookieCache: {
					enabled: true,
					strategy: "jwe",
				},
			},
		});

		const ctx = await auth.$context;
		const accountDataCookieName = ctx.authCookies.accountData.name;
		const sessionDataCookieName = ctx.authCookies.sessionData.name;

		const headers = new Headers();
		email = "refresh-account-cookie-test@test.com";

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		let initialAccountCookieSet = false;
		let initialSessionCookieSet = false;

		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				initialAccountCookieSet = !!cookies.get(accountDataCookieName)?.value;
				initialSessionCookieSet = !!cookies.get(sessionDataCookieName)?.value;
				cookieSetter(headers)({ response: context.response });
			},
		});

		expect(initialAccountCookieSet).toBe(true);
		expect(initialSessionCookieSet).toBe(true);

		const currentSession = await client.getSession({
			fetchOptions: { headers },
		});
		expect(currentSession.data).not.toBeNull();
		const sessionToken = currentSession.data?.session?.token;

		// Make session due for refresh
		const pastExpiresAt = new Date(
			Date.now() + sessionExpiresIn * 1000 - sessionUpdateAge * 1000 - 1000,
		);
		if (sessionToken) {
			await ctx.adapter.update({
				model: "session",
				where: [{ field: "token", value: sessionToken }],
				update: { expiresAt: pastExpiresAt },
			});
		}

		let refreshedAccountCookie = false;
		let refreshedSessionCookie = false;

		await client.getSession({
			query: { disableCookieCache: true },
			fetchOptions: {
				headers,
				onSuccess(context) {
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					refreshedAccountCookie = !!cookies.get(accountDataCookieName)?.value;
					refreshedSessionCookie = !!cookies.get(sessionDataCookieName)?.value;
					cookieSetter(headers)(context);
				},
			},
		});

		expect(refreshedSessionCookie).toBe(true);
		expect(refreshedAccountCookie).toBe(true);
	});

	it("should refresh account_data cookie in stateless mode", async () => {
		const refreshUpdateAge = 60;

		const { auth, client, cookieSetter } = await getTestInstance({
			database: undefined,
			socialProviders: {
				google: { clientId: "test", clientSecret: "test", enabled: true },
			},
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
					maxAge: 300,
					refreshCache: { updateAge: refreshUpdateAge },
				},
			},
		});

		const ctx = await auth.$context;
		const accountDataCookieName = ctx.authCookies.accountData.name;
		const sessionDataCookieName = ctx.authCookies.sessionData.name;

		expect(
			(ctx.options as { account?: { storeAccountCookie?: boolean } }).account
				?.storeAccountCookie,
		).toBe(true);

		const headers = new Headers();
		email = "stateless-refresh-test@test.com";

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: { onSuccess: cookieSetter(headers) },
		});

		const state =
			signInRes.data && "url" in signInRes.data && signInRes.data.url
				? new URL(signInRes.data.url).searchParams.get("state") || ""
				: "";

		let initialAccountCookieSet = false;
		let initialSessionCookieSet = false;

		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				initialAccountCookieSet = !!cookies.get(accountDataCookieName)?.value;
				initialSessionCookieSet = !!cookies.get(sessionDataCookieName)?.value;
				cookieSetter(headers)({ response: context.response });
			},
		});

		expect(initialAccountCookieSet).toBe(true);
		expect(initialSessionCookieSet).toBe(true);

		const firstSession = await client.getSession({
			fetchOptions: { headers },
		});
		expect(firstSession.data).not.toBeNull();
		const sessionToken = firstSession.data?.session?.token;

		if (sessionToken) {
			await ctx.internalAdapter.deleteSession(sessionToken);
		}

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 241);

		let refreshedAccountCookie = false;
		let refreshedSessionCookie = false;

		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					refreshedAccountCookie = !!cookies.get(accountDataCookieName)?.value;
					refreshedSessionCookie = !!cookies.get(sessionDataCookieName)?.value;
					cookieSetter(headers)(context);
				},
			},
		});

		vi.useRealTimers();

		expect(refreshedSessionCookie).toBe(true);
		expect(refreshedAccountCookie).toBe(true);
	});
});

describe("token routes cookie cache revocation", async () => {
	it("get-access-token fails closed after the session is revoked in a stateful deployment", async () => {
		const { auth, client, testUser, cookieSetter } = await getTestInstance({
			session: { cookieCache: { enabled: true, maxAge: 60 } },
		});

		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: cookieSetter(headers) },
		);
		const initial = await client.getSession({
			fetchOptions: { headers, onSuccess: cookieSetter(headers) },
		});
		const sessionToken = initial.data!.session.token;
		expect(headers.get("cookie")).toContain("session_data");

		// Revoke server-side; the cookie cache is the only thing still vouching.
		const ctx = await auth.$context;
		await ctx.internalAdapter.deleteSession(sessionToken);

		// resolveUserId validates against the database before any account lookup,
		// so the revoked session is rejected outright rather than minting a token.
		const res = await client.$fetch("/get-access-token", {
			method: "POST",
			body: { providerId: "google" },
			headers,
		});
		expect(res.error?.status).toBe(401);

		// A request must not re-enable the cookie cache to revive the revoked
		// session. `z.coerce.boolean()` reads an empty value as false, so the
		// forced strict validation has to ignore it.
		const bypass = await client.$fetch(
			"/get-access-token?disableCookieCache=",
			{
				method: "POST",
				body: { providerId: "google" },
				headers,
			},
		);
		expect(bypass.error?.status).toBe(401);
	});
});

describe("account resolution in stateless mode", async () => {
	const IDP = "https://idp.stateless.test";
	const STATELESS_SECRET = "stateless-test-secret-stateless-test-secret";

	const idpHandlers = [
		http.get(`${IDP}/.well-known/openid-configuration`, () =>
			HttpResponse.json({
				issuer: IDP,
				authorization_endpoint: `${IDP}/authorize`,
				token_endpoint: `${IDP}/token`,
				userinfo_endpoint: `${IDP}/userinfo`,
				jwks_uri: `${IDP}/jwks`,
			}),
		),
		http.post(`${IDP}/token`, async ({ request }) => {
			const params = new URLSearchParams(await request.text());
			if (params.get("grant_type") === "refresh_token") {
				return HttpResponse.json({
					token_type: "Bearer",
					access_token: "idp-refreshed-access-token",
					refresh_token: "idp-rotated-refresh-token",
					expires_in: 3600,
					scope: "openid profile email",
				});
			}
			return HttpResponse.json({
				token_type: "Bearer",
				access_token: "idp-access-token",
				refresh_token: "idp-refresh-token",
				expires_in: 3600,
				scope: "openid profile email",
			});
		}),
	];

	beforeEach(() => server.use(...idpHandlers));

	const makeStatelessAuth = () =>
		betterAuth({
			secret: STATELESS_SECRET,
			baseURL: "http://localhost:3000",
			trustedOrigins: ["http://localhost:3000"],
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe",
					maxAge: 60,
					refreshCache: { updateAge: 60 * 60 },
				},
			},
			account: { storeStateStrategy: "cookie", storeAccountCookie: true },
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "idp",
							clientId: "client-id",
							clientSecret: "client-secret",
							scopes: ["openid", "profile", "email"],
							discoveryUrl: `${IDP}/.well-known/openid-configuration`,
							getUserInfo: async (tokens) => ({
								id: "shared-idp-user",
								email: "user@stateless.test",
								name: "Stateless User",
								emailVerified: true,
								accessTokenSeen: tokens.accessToken,
							}),
						},
					],
				}),
			],
		});

	type Jar = Map<string, string>;

	const collectCookies = (res: Response, jar: Jar) => {
		for (const cookie of res.headers.getSetCookie()) {
			const [pair = ""] = cookie.split(";");
			const idx = pair.indexOf("=");
			if (idx > 0) {
				jar.set(pair.slice(0, idx), pair.slice(idx + 1));
			}
		}
	};

	const cookieHeader = (jar: Jar) =>
		[...jar].map(([name, value]) => `${name}=${value}`).join("; ");

	const requestHeaders = (jar: Jar) =>
		new Headers({
			cookie: cookieHeader(jar),
			host: "localhost:3000",
		});

	const signIn = async (auth: ReturnType<typeof makeStatelessAuth>) => {
		const jar: Jar = new Map();
		let res = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/oauth2", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ providerId: "idp", callbackURL: "/" }),
			}),
		);
		collectCookies(res, jar);
		const { url } = (await res.json()) as { url: string };
		const state = new URL(url).searchParams.get("state");
		assert(state, "expected an OAuth state to be issued");

		res = await auth.handler(
			new Request(
				`http://localhost:3000/api/auth/oauth2/callback/idp?code=test-code&state=${state}`,
				{ headers: requestHeaders(jar), redirect: "manual" },
			),
		);
		collectCookies(res, jar);

		const session = (await auth.api.getSession({
			headers: requestHeaders(jar),
		})) as { user: { id: string } } | null;
		assert(session?.user.id, "expected OAuth sign-in to create a session");
		return { jar, userId: session.user.id };
	};

	const signInOnTwoInstances = async () => {
		const authA = makeStatelessAuth();
		const a = await signIn(authA);
		const b = await signIn(makeStatelessAuth());
		expect(a.userId).not.toBe(b.userId);

		const accountCookieName = (await authA.$context).authCookies.accountData
			.name;
		const mixed: Jar = new Map(a.jar);
		for (const key of [...mixed.keys()]) {
			if (key.startsWith(accountCookieName)) mixed.delete(key);
		}
		for (const [key, value] of b.jar) {
			if (key.startsWith(accountCookieName)) mixed.set(key, value);
		}

		return {
			accountCookieName,
			mixed,
			sessionUserId: a.userId,
		};
	};

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9978
	 */
	it("resolves getAccessToken with a valid account cookie whose userId differs from the session user", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances();

		const result = await makeStatelessAuth().api.getAccessToken({
			body: { providerId: "idp", userId: sessionUserId },
			headers: requestHeaders(mixed),
		});

		expect(result.accessToken).toBe("idp-access-token");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9978
	 */
	it("resolves accountInfo with a valid account cookie whose userId differs from the session user", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances();

		const info = await makeStatelessAuth().api.accountInfo({
			query: { providerId: "idp", userId: sessionUserId },
			headers: requestHeaders(mixed),
		});

		assert(info, "expected accountInfo to resolve from the account cookie");
		expect(info.user.id).toBe("shared-idp-user");
		expect(info.data.accessTokenSeen).toBe("idp-access-token");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9978
	 */
	it("refreshes a valid account cookie whose userId differs from the session user", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances();

		const result = await makeStatelessAuth().api.refreshToken({
			body: { providerId: "idp", userId: sessionUserId },
			headers: requestHeaders(mixed),
		});

		expect(result.accessToken).toBe("idp-refreshed-access-token");
		expect(result.refreshToken).toBe("idp-rotated-refresh-token");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9978
	 */
	it("preserves a valid mismatched account cookie during stateless session refresh", async () => {
		const { accountCookieName, mixed } = await signInOnTwoInstances();

		const res = await makeStatelessAuth().handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: requestHeaders(mixed),
			}),
		);
		expect(res.status).toBe(200);

		const cookies = parseSetCookieHeader(res.headers.get("set-cookie") || "");
		const accountCookie = cookies.get(accountCookieName);
		expect(accountCookie?.value).toBeTruthy();
		expect(accountCookie?.maxAge).not.toBe(0);
	});
});
