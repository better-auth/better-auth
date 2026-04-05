import { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { MockInstance } from "vitest";
import {
	afterAll,
	afterEach,
	assert,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { signJWT, symmetricDecodeJWT } from "../../crypto";
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
			database: undefined as any,
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

	it("should not overwrite fresh account cookie with stale request data on re-login", async () => {
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
				cookieCache: {
					enabled: true,
					strategy: "jwe",
				},
			},
		});

		const ctx = await auth.$context;
		const accountDataCookieName = ctx.authCookies.accountData.name;

		const headers = new Headers();
		email = "stale-cookie-test@test.com";

		// First login
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

		// Verify first login tokens
		const firstAccessToken = await client.getAccessToken(
			{ providerId: "google" },
			{ headers },
		);
		expect(firstAccessToken.data?.accessToken).toBe("test");

		// Change the mock to return different tokens for the second login.
		// This lets us distinguish fresh tokens from stale ones.
		server.use(
			http.post(
				"https://oauth2.googleapis.com/token",
				async () => {
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
						access_token: "refreshed_token",
						refresh_token: "refreshed_refresh",
						id_token: testIdToken,
					});
				},
				{ once: true },
			),
		);

		// Re-login WITHOUT signing out. The old account cookie from the
		// first login is still in the request headers. This is the scenario
		// that triggers the bug: setCookieCache re-reads the old cookie from
		// the request and overwrites the fresh one from handleOAuthUserInfo.
		const reLoginRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const reLoginState =
			reLoginRes.data && "url" in reLoginRes.data && reLoginRes.data.url
				? new URL(reLoginRes.data.url).searchParams.get("state") || ""
				: "";

		let freshAccountCookieValue: string | undefined;
		await client.$fetch("/callback/google", {
			query: { state: reLoginState, code: "test" },
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);

				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				freshAccountCookieValue = cookies.get(accountDataCookieName)?.value;

				cookieSetter(headers)({ response: context.response });
			},
		});

		// The account cookie must be present
		expect(freshAccountCookieValue).toBeDefined();

		// Decrypt and verify the cookie contains the NEW tokens, not the
		// stale ones from the first login
		const accountData = await symmetricDecodeJWT<Account>(
			freshAccountCookieValue!,
			ctx.secret,
			"better-auth-account",
		);

		expect(accountData).toBeDefined();
		expect(accountData!.accessToken).toBe("refreshed_token");
		expect(accountData!.refreshToken).toBe("refreshed_refresh");

		// Also verify getAccessToken returns the fresh token
		const reLoginAccessToken = await client.getAccessToken(
			{ providerId: "google" },
			{ headers },
		);
		expect(reLoginAccessToken.data?.accessToken).toBe("refreshed_token");
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
			database: undefined as any,
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
