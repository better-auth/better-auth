import { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { MockInstance } from "vitest";
import {
	afterAll,
	afterEach,
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
				BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT,
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
});
