import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import type { SecondaryStorage } from "@better-auth/core/db";
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
import { twoFactor } from "../../plugins/two-factor";
import { getTestInstance } from "../../test-utils/test-instance";
import type { Account } from "../../types";
import { DEFAULT_SECRET } from "../../utils/constants";
import { getSessionFromCtx } from "./session";

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
	const googleVerifyIdTokenMock =
		vi.fn<(token: string, nonce?: string) => Promise<boolean>>();
	const { auth, signInWithTestUser, client } = await getTestInstance({
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
				enabled: true,
				verifyIdToken: googleVerifyIdTokenMock,
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

	let googleGetUserInfoMock: MockInstance;
	beforeAll(() => {
		const googleProvider = ctx.socialProviders.find((v) => v.id === "google")!;
		expect(googleProvider).toBeTruthy();

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
			expect(accounts.data?.[0]).toMatchObject({ providerId: "credential" });
			expect(accounts.data?.[0]).not.toHaveProperty("providerInstanceId");
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
							`${headers.get("cookie") || ""}; better-auth.state=${cookies.get("better-auth.state")?.value}`,
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
			const accounts = await client.listAccounts();
			const googleAccount = accounts.data?.find(
				(candidate) => candidate.providerId === "google",
			);
			assert(googleAccount, "google account should be listed");
			const accessToken = await client.getAccessToken({
				accountId: googleAccount.id,
			});
			expect(accessToken.data?.accessToken).toBe("test");
		});
	});

	it("should expose and select a linked account by its local account ID", async () => {
		const {
			auth: isolatedAuth,
			client: isolatedClient,
			signInWithTestUser: signInOnIsolatedInstance,
		} = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const isolatedContext = await isolatedAuth.$context;
		const { user, headers } = await signInOnIsolatedInstance();
		const { account: storedAccount } =
			await isolatedContext.internalAdapter.linkAccount(
				user.id,
				{
					issuer: "https://accounts.google.com",
					providerAccountId: "local-account-selector-subject",
				},
				{
					providerId: "google",
					providerInstanceId: "google",
					accessToken: "local-account-selector-token",
				},
			);

		const accounts = await isolatedClient.listAccounts({
			fetchOptions: { headers },
		});
		const googleAccount = accounts.data?.find(
			(account) => account.id === storedAccount.id,
		);
		assert(googleAccount, "google account should be listed");
		expect(googleAccount.identity.issuer).toBe("https://accounts.google.com");
		expect(googleAccount.identity.providerAccountId).toBe(
			"local-account-selector-subject",
		);
		expect(googleAccount.id).not.toBe(googleAccount.identity.providerAccountId);

		const accessToken = await isolatedClient.getAccessToken(
			{ accountId: googleAccount.id },
			{ headers },
		);

		expect(accessToken.error).toBeNull();
		expect(accessToken.data?.accessToken).toBe("local-account-selector-token");
	});

	it("should not expose empty scope tokens from stored empty account scope", async () => {
		const {
			auth,
			client: scopedClient,
			testUser,
			cookieSetter,
		} = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const headers = new Headers();
		await scopedClient.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{ onSuccess: cookieSetter(headers) },
		);
		const session = await scopedClient.getSession({
			fetchOptions: { headers },
		});
		const providerAccountId = "empty-scope-google-account";
		const testCtx = await auth.$context;
		const { account: storedAccount } =
			await testCtx.internalAdapter.linkAccount(
				session.data!.user.id,
				{
					issuer: "https://accounts.google.com",
					providerAccountId,
				},
				{
					providerId: "google",
					providerInstanceId: "google",
					accessToken: "access-token",
					scope: "",
				},
			);

		const accounts = await scopedClient.listAccounts({
			fetchOptions: { headers },
		});
		const googleAccount = accounts.data?.find(
			(account) => account.identity.providerAccountId === providerAccountId,
		);
		expect(googleAccount?.scopes).toEqual([]);

		const accessToken = await scopedClient.getAccessToken(
			{
				accountId: storedAccount.id,
			},
			{ headers },
		);
		expect(accessToken.data?.scopes).toEqual([]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8345
	 */
	it("should get account info using the local account ID", async () => {
		const {
			auth,
			client: isolatedClient,
			signInWithTestUser: signInIsolatedUser,
		} = await getTestInstance({
			socialProviders: {
				google: { clientId: "test", clientSecret: "test", enabled: true },
			},
		});
		const context = await auth.$context;
		const googleProvider = context.socialProviders.find(
			(provider) => provider.id === "google",
		)!;
		vi.spyOn(googleProvider, "getUserInfo").mockResolvedValue({
			user: {
				name: "Provider User",
				email: "provider-user@example.com",
				emailVerified: true,
			},
			data: { sub: "provider-subject" },
		});
		const { runWithUser: runWithIsolatedUser, user } =
			await signInIsolatedUser();
		const { account: googleAccount, identity: googleIdentity } =
			await context.internalAdapter.linkAccount(
				user.id,
				{
					issuer: "https://accounts.google.com",
					providerAccountId: "provider-subject",
				},
				{
					providerId: "google",
					providerInstanceId: "google",
					accessToken: "provider-access-token",
				},
			);

		await runWithIsolatedUser(async () => {
			const info = await isolatedClient.accountInfo({
				query: { accountId: googleAccount.id },
			});

			expect(info.data).toMatchObject({
				user: expect.objectContaining({
					email: expect.any(String),
				}),
				account: {
					id: googleAccount.id,
					providerId: googleAccount.providerId,
					identity: {
						id: googleIdentity.id,
						issuer: googleIdentity.issuer,
						providerAccountId: googleIdentity.providerAccountId,
					},
				},
				data: expect.any(Object),
			});
		});
	});

	it("returns an authentication error when the provider cannot resolve account info", async () => {
		const {
			auth,
			client: isolatedClient,
			signInWithTestUser: signInIsolatedUser,
		} = await getTestInstance({
			socialProviders: {
				google: { clientId: "test", clientSecret: "test", enabled: true },
			},
		});
		const context = await auth.$context;
		const googleProvider = context.socialProviders.find(
			(provider) => provider.id === "google",
		)!;
		vi.spyOn(googleProvider, "getUserInfo").mockResolvedValue(null);
		const { runWithUser, user } = await signInIsolatedUser();
		const { account: googleAccount } =
			await context.internalAdapter.linkAccount(
				user.id,
				{
					issuer: "https://accounts.google.com",
					providerAccountId: "unavailable-provider-subject",
				},
				{
					providerId: "google",
					providerInstanceId: "google",
					accessToken: "provider-access-token",
				},
			);

		await runWithUser(async () => {
			const info = await isolatedClient.$fetch("/account-info", {
				query: { accountId: googleAccount.id },
				method: "GET",
			});

			expect(info.data).toBeNull();
			expect(info.error).toMatchObject({
				status: 401,
				code: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO.code,
				message: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO.message,
			});
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8350
	 */
	it("should get account info server-side using userId without session headers", async () => {
		const { auth } = await getTestInstance({
			socialProviders: {
				google: { clientId: "test", clientSecret: "test", enabled: true },
			},
		});
		const context = await auth.$context;
		const user = await context.internalAdapter.createUser(
			{
				name: "Server-side Account User",
				email: "account-info-server-side@test.com",
			},
			{ method: "test" },
		);
		const { account: googleAccount, identity: googleIdentity } =
			await context.internalAdapter.linkAccount(
				user.id,
				{
					issuer: "https://accounts.google.com",
					providerAccountId: "server-side-provider-subject",
				},
				{
					providerId: "google",
					providerInstanceId: "google",
					accessToken: "server-side-access-token",
				},
			);
		const googleProvider = context.socialProviders.find(
			(provider) => provider.id === "google",
		)!;
		vi.spyOn(googleProvider, "getUserInfo").mockResolvedValue({
			user: {
				name: "Provider User",
				email: user.email,
				emailVerified: true,
			},
			data: { sub: googleIdentity.providerAccountId },
		});

		// No headers: the server-side caller identifies the user via userId.
		const info = await auth.api.accountInfo({
			query: {
				accountId: googleAccount.id,
				userId: googleIdentity.userId,
			},
		});

		expect(info).toMatchObject({
			user: expect.objectContaining({
				email: expect.any(String),
			}),
			account: {
				id: googleAccount.id,
				providerId: googleAccount.providerId,
				identity: {
					id: googleIdentity.id,
					issuer: googleIdentity.issuer,
					providerAccountId: googleIdentity.providerAccountId,
				},
			},
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
	it("should not resolve another user's local account ID", async () => {
		const { auth, signInWithTestUser, client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});
		const ctx = await auth.$context;
		const googleProvider = ctx.socialProviders.find((v) => v.id === "google")!;
		const getUserInfoMock = vi.spyOn(googleProvider, "getUserInfo");
		const otherUser = await ctx.internalAdapter.createUser(
			{
				name: "Other User",
				email: "other-account-info@example.com",
			},
			{ method: "test" },
		);
		const { account: otherUserAccount } = await ctx.internalAdapter.linkAccount(
			otherUser.id,
			{
				issuer: "https://accounts.google.com",
				providerAccountId: "other-user-google-subject",
			},
			{
				providerId: "google",
				providerInstanceId: "google",
				accessToken: "other-access-token",
			},
		);

		const { runWithUser } = await signInWithTestUser();

		await runWithUser(async () => {
			const info = await client.$fetch("/account-info", {
				query: { accountId: otherUserAccount.id },
				method: "GET",
			});

			expect(info.error?.message).toBe(
				BASE_ERROR_CODES.ACCOUNT_NOT_FOUND.message,
			);
			expect(getUserInfoMock).not.toHaveBeenCalled();
		});
	});

	it("should select a local row when provider subjects collide across issuers", async () => {
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
		const githubProvider = ctx.socialProviders.find((v) => v.id === "github")!;
		const githubGetUserInfoMock = vi.spyOn(githubProvider, "getUserInfo");
		const sharedProviderAccountId = "shared-provider-account-id";

		const { runWithUser, user } = await signInWithTestUser();
		await ctx.internalAdapter.linkAccount(
			user.id,
			{
				issuer: "https://accounts.google.com",
				providerAccountId: sharedProviderAccountId,
			},
			{
				providerId: "google",
				providerInstanceId: "google",
				accessToken: "google-access-token",
			},
		);
		const { account: githubAccount } = await ctx.internalAdapter.linkAccount(
			user.id,
			{
				issuer: "local:github",
				providerAccountId: sharedProviderAccountId,
			},
			{
				providerId: "github",
				providerInstanceId: "github",
				accessToken: "github-access-token",
			},
		);

		await runWithUser(async () => {
			githubGetUserInfoMock.mockResolvedValueOnce({
				user: {
					name: user.name,
					email: user.email,
					emailVerified: user.emailVerified,
				},
				data: { source: "github" },
			});
			const githubInfo = await client.$fetch("/account-info", {
				query: { accountId: githubAccount.id },
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
	it("should enforce local account ownership on the server-side userId path", async () => {
		const { auth } = await getTestInstance({
			socialProviders: {
				github: { clientId: "test", clientSecret: "test", enabled: true },
			},
		});
		const ctx = await auth.$context;
		const githubProvider = ctx.socialProviders.find((v) => v.id === "github")!;
		const githubGetUserInfoMock = vi.spyOn(githubProvider, "getUserInfo");

		const selectedUser = await ctx.internalAdapter.createUser(
			{
				name: "Server Side User",
				email: "server-side-disambiguate@example.com",
			},
			{ method: "test" },
		);
		const otherUser = await ctx.internalAdapter.createUser(
			{
				name: "Other Server Side User",
				email: "other-server-side@example.com",
			},
			{ method: "test" },
		);
		const { account: otherUserAccount } = await ctx.internalAdapter.linkAccount(
			otherUser.id,
			{
				issuer: "local:github",
				providerAccountId: "other-server-side-subject",
			},
			{
				providerId: "github",
				providerInstanceId: "github",
				accessToken: "github-access-token",
			},
		);

		await expect(
			auth.api.accountInfo({
				query: {
					accountId: otherUserAccount.id,
					userId: selectedUser.id,
				},
			}),
		).rejects.toMatchObject({
			body: expect.objectContaining({
				message: BASE_ERROR_CODES.ACCOUNT_NOT_FOUND.message,
			}),
		});
		expect(githubGetUserInfoMock).not.toHaveBeenCalled();
	});

	it("should reject account info for a non-social (credential) account", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const accounts = await client.listAccounts();
			const credentialAccount = accounts.data?.find(
				(account) => account.providerId === "credential",
			);
			assert(credentialAccount, "credential account should be listed");
			const info = await client.$fetch("/account-info", {
				query: { accountId: credentialAccount.id },
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/2351
	 */
	it("should forward additionalParams and loginHint to the authorization URL", async () => {
		const { runWithUser: runWithClient2 } = await signInWithTestUser();
		await runWithClient2(async () => {
			const linkAccountRes = await client.linkSocial({
				provider: "google",
				callbackURL: "/callback",
				loginHint: "user@example.com",
				additionalParams: {
					access_type: "offline",
					prompt: "consent",
				},
			});

			expect(linkAccountRes.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			const url = new URL(linkAccountRes.data!.url);
			expect(url.searchParams.get("access_type")).toBe("offline");
			expect(url.searchParams.get("prompt")).toBe("consent");
			expect(url.searchParams.get("login_hint")).toBe("user@example.com");
		});
	});

	it("should reject additionalParams that override reserved OAuth params", async () => {
		const { runWithUser: runWithClient2 } = await signInWithTestUser();
		await runWithClient2(async () => {
			const linkAccountRes = await client.linkSocial({
				provider: "google",
				callbackURL: "/callback",
				additionalParams: {
					state: "attacker-controlled",
				},
			});
			expect(linkAccountRes.error?.status).toBe(400);
		});
	});

	it("should pass idTokenNonce to providers that require redirect nonce binding", async () => {
		const googleProvider = ctx.socialProviders.find((v) => v.id === "google")!;
		const previousRequiresIdTokenNonce = googleProvider.requiresIdTokenNonce;
		googleProvider.requiresIdTokenNonce = true;
		const createAuthorizationURLSpy = vi.spyOn(
			googleProvider,
			"createAuthorizationURL",
		);

		try {
			const { runWithUser: runWithClient2 } = await signInWithTestUser();
			await runWithClient2(async () => {
				const linkAccountRes = await client.linkSocial({
					provider: "google",
					callbackURL: "/callback",
				});
				expect(linkAccountRes.error).toBeNull();
				expect(createAuthorizationURLSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						idTokenNonce: expect.any(String),
					}),
				);
			});
		} finally {
			googleProvider.requiresIdTokenNonce = previousRequiresIdTokenNonce;
			createAuthorizationURLSpy.mockRestore();
		}
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
							`${headers.get("cookie") || ""}; better-auth.state=${cookies.get("better-auth.state")?.value}`,
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
							`${headers.get("cookie") || ""}; better-auth.state=${cookies.get("better-auth.state")?.value}`,
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

	it("returns 401 over HTTP when a linked provider resolves an invalid account subject", async () => {
		const {
			auth,
			client: isolatedClient,
			signInWithTestUser: signInIsolatedUser,
		} = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					verifyIdToken: async () => true,
				},
			},
		});
		const context = await auth.$context;
		const googleProvider = context.socialProviders.find(
			(provider) => provider.id === "google",
		);
		assert(googleProvider, "google provider should be configured");
		googleProvider.identitySubject = () => "";
		vi.spyOn(googleProvider, "getUserInfo").mockResolvedValue({
			user: {
				name: "Invalid Subject User",
				email: "invalid-subject@example.com",
				emailVerified: true,
			},
			data: { sub: "ignored-provider-subject" },
		});
		const { headers, user } = await signInIsolatedUser();

		const result = await isolatedClient.$fetch("/link-social", {
			method: "POST",
			body: {
				provider: "google",
				idToken: { token: "verified-id-token" },
			},
			headers,
		});

		expect(result.data).toBeNull();
		expect(result.error).toMatchObject({
			status: 401,
			code: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO.code,
			message: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO.message,
		});
		const accounts = await context.internalAdapter.listUserAccounts(user.id);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.account.providerId).toBe("credential");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10214
	 */
	it("should reuse an issuer subject across provider aliases without allowing cross-user linking", async () => {
		const verifyIdToken = vi.fn(async () => true);
		const {
			auth,
			client: isolatedClient,
			signInWithTestUser: signInIsolatedTestUser,
			cookieSetter,
		} = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					verifyIdToken,
				},
			},
			account: {
				accountLinking: {
					allowDifferentEmails: true,
				},
			},
		});
		const isolatedContext = await auth.$context;
		const googleProvider = isolatedContext.socialProviders.find(
			(provider) => provider.id === "google",
		);
		assert(googleProvider, "google provider should be configured");
		const providerAccountId = "shared-direct-link-subject";
		vi.spyOn(googleProvider, "getUserInfo").mockResolvedValue({
			user: {
				name: "Shared Social User",
				email: "shared-social@example.com",
				emailVerified: true,
			},
			data: { sub: providerAccountId },
		});
		isolatedContext.socialProviders.push({
			...googleProvider,
			id: "google-mobile",
			name: "Google Mobile",
		});

		const firstUserSession = await signInIsolatedTestUser();
		const linkBody = {
			idToken: { token: "verified-id-token" },
		};
		const firstLink = await isolatedClient.$fetch("/link-social", {
			method: "POST",
			body: { ...linkBody, provider: "google" },
			headers: firstUserSession.headers,
		});
		expect(firstLink.error).toBeNull();

		const aliasLink = await isolatedClient.$fetch("/link-social", {
			method: "POST",
			body: { ...linkBody, provider: "google-mobile" },
			headers: firstUserSession.headers,
		});
		expect(aliasLink.error).toBeNull();
		expect(aliasLink.data).toMatchObject({ status: true, redirect: false });

		const firstUserAccounts =
			await isolatedContext.internalAdapter.listUserAccounts(
				firstUserSession.user.id,
			);
		const aliasedAccounts = firstUserAccounts.filter(
			({ identity }) =>
				identity.issuer === "https://accounts.google.com" &&
				identity.providerAccountId === providerAccountId,
		);
		expect(aliasedAccounts).toHaveLength(2);
		expect(
			aliasedAccounts.map(({ account }) => account.providerId).sort(),
		).toEqual(["google", "google-mobile"]);
		expect(new Set(aliasedAccounts.map(({ identity }) => identity.id))).toEqual(
			new Set([aliasedAccounts[0]!.identity.id]),
		);

		const secondUserHeaders = new Headers();
		await isolatedClient.signUp.email(
			{
				name: "Second User",
				email: "second-direct-link@example.com",
				password: "password123456",
			},
			{ onSuccess: cookieSetter(secondUserHeaders) },
		);
		const secondUserSession = await auth.api.getSession({
			headers: secondUserHeaders,
		});
		assert(secondUserSession, "second user should be signed in");

		const conflictingLink = await isolatedClient.$fetch("/link-social", {
			method: "POST",
			body: { ...linkBody, provider: "google-mobile" },
			headers: secondUserHeaders,
		});
		expect(conflictingLink.error?.status).toBe(409);
		expect(conflictingLink.error?.message).toBe(
			BASE_ERROR_CODES.SOCIAL_ACCOUNT_ALREADY_LINKED.message,
		);
		const secondUserAccounts =
			await isolatedContext.internalAdapter.listUserAccounts(
				secondUserSession.user.id,
			);
		expect(
			secondUserAccounts.some(
				({ identity }) =>
					identity.issuer === "https://accounts.google.com" &&
					identity.providerAccountId === providerAccountId,
			),
		).toBe(false);
	});

	it("should unlink account", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const previousAccounts = await client.listAccounts();
			expect(previousAccounts.data?.length).toBe(3);
			const googleAccount = previousAccounts.data?.find(
				(account) => account.providerId === "google",
			);
			assert(googleAccount, "a Google account should be linked");
			const unlinkRes = await client.unlinkAccount({
				accountId: googleAccount.id,
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
			const unlinkAccountId = previousAccounts.data![0]!.id;
			const unlinkRes = await client.unlinkAccount({
				accountId: unlinkAccountId,
			});
			expect(unlinkRes.error?.message).toBe(
				BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT.message,
			);
		});
	});

	it("should unlink only the selected local account row", async () => {
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const previousAccounts = await client.listAccounts();
			expect(previousAccounts.data?.length).toBeGreaterThan(0);

			const accountToUnlink = previousAccounts.data![0]!;
			const unlinkAccountId = accountToUnlink.id;
			const providerId = accountToUnlink.providerId;
			const accountsWithSameProvider = previousAccounts.data!.filter(
				(account) => account.providerId === providerId,
			);
			if (accountsWithSameProvider.length <= 1) {
				return;
			}

			const unlinkRes = await client.unlinkAccount({
				accountId: unlinkAccountId,
			});

			expect(unlinkRes.data?.status).toBe(true);

			const accountsAfterUnlink = await client.listAccounts();

			expect(accountsAfterUnlink.data?.length).toBe(
				previousAccounts.data!.length - 1,
			);
			expect(
				accountsAfterUnlink.data?.find((a) => a.id === unlinkAccountId),
			).toBeUndefined();
		});
	});

	it("should unlink provider accounts individually by local account ID", async () => {
		const { runWithUser, user } = await signInWithTestUser();
		await ctx.internalAdapter.linkAccount(
			user.id,
			{
				issuer: "https://accounts.google.com",
				providerAccountId: "123",
			},
			{
				providerId: "google",
				providerInstanceId: "google",
			},
		);

		await ctx.internalAdapter.linkAccount(
			user.id,
			{
				issuer: "https://accounts.google.com",
				providerAccountId: "345",
			},
			{
				providerId: "google",
				providerInstanceId: "google",
			},
		);

		await runWithUser(async () => {
			const previousAccounts = await client.listAccounts();

			const googleAccounts = previousAccounts.data!.filter(
				(account) => account.providerId === "google",
			);
			expect(googleAccounts.length).toBeGreaterThan(1);

			for (let i = 0; i < googleAccounts.length - 1; i++) {
				const unlinkRes = await client.unlinkAccount({
					accountId: googleAccounts[i]!.id,
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

	it("should unlink an account without invoking identity lifecycle hooks", async () => {
		const identityDeleteBefore = vi.fn();
		const { auth, client, signInWithTestUser } = await getTestInstance({
			account: {
				accountLinking: { allowUnlinkingAll: true },
			},
			databaseHooks: {
				identity: {
					delete: {
						async before() {
							identityDeleteBefore();
							return false;
						},
					},
				},
			},
		});
		const testContext = await auth.$context;
		const { runWithUser, user } = await signInWithTestUser();

		await runWithUser(async () => {
			const accountsBefore = await client.listAccounts();
			const account = accountsBefore.data?.[0];
			assert(account, "signed-in user should have an account");

			const unlinkResponse = await client.unlinkAccount({
				accountId: account.id,
			});
			expect(unlinkResponse.data?.status).toBe(true);
			expect(identityDeleteBefore).not.toHaveBeenCalled();

			const accountsAfter = await client.listAccounts();
			expect(accountsAfter.data).toEqual([]);
			await expect(
				testContext.internalAdapter.findIdentityByKey({
					issuer: account.identity.issuer,
					providerAccountId: account.identity.providerAccountId,
				}),
			).resolves.toMatchObject({ userId: user.id });
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
			{ useAccountCookie: true },
			{ headers },
		);

		expect(accessTokenRes.error).toBeNull();
		expect(accessTokenRes.data).toBeDefined();
		expect(accessTokenRes.data?.accessToken).toBe("test");
	});

	it("should use the selected account cookie in getAccessToken", async () => {
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

		// Stateful deployments use the signed cookie as an account selector and
		// resolve the current account data from the database.
		const findAccountByIdSpy = vi.spyOn(
			testCtx.internalAdapter,
			"findAccountWithIdentityById",
		);

		const accessTokenRes = await client.getAccessToken(
			{ useAccountCookie: true },
			{ headers },
		);

		expect(accessTokenRes.data?.accessToken).toBe("test");
		expect(findAccountByIdSpy).toHaveBeenCalledOnce();
		findAccountByIdSpy.mockRestore();
	});

	it("should reject a stale account cookie immediately after unlinking", async () => {
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
				accountLinking: { allowUnlinkingAll: true },
			},
		});
		const testContext = await auth.$context;
		const headers = new Headers();
		email = "stale-unlinked-account-cookie@test.com";

		const signInResponse = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: { onSuccess: cookieSetter(headers) },
		});
		const state =
			signInResponse.data &&
			"url" in signInResponse.data &&
			signInResponse.data.url
				? new URL(signInResponse.data.url).searchParams.get("state") || ""
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

		const session = await auth.api.getSession({ headers });
		assert(session, "OAuth sign-in should create a session");
		const account = (
			await testContext.internalAdapter.listUserAccounts(session.user.id)
		).find(({ account }) => account.providerId === "google");
		assert(account, "Google account should exist");

		const unlinkHeaders = new Headers(headers);
		unlinkHeaders.set("content-type", "application/json");
		const unlinkResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/unlink-account", {
				method: "POST",
				headers: unlinkHeaders,
				body: JSON.stringify({ accountId: account.account.id }),
			}),
		);
		expect(unlinkResponse.status).toBe(200);
		const unlinkCookies = parseSetCookieHeader(
			unlinkResponse.headers.get("set-cookie") ?? "",
		);
		expect(
			unlinkCookies.get(testContext.authCookies.accountData.name)?.value,
		).toBe("");
		expect(
			unlinkCookies.get(testContext.authCookies.providerAccountBinding.name)
				?.value,
		).toBe("");
		cookieSetter(headers)({ response: unlinkResponse });

		const accessTokenResponse = await client.getAccessToken(
			{ useAccountCookie: true },
			{ headers },
		);
		expect(accessTokenResponse.error?.message).toBe(
			BASE_ERROR_CODES.ACCOUNT_NOT_FOUND.message,
		);

		const refreshTokenResponse = await client.refreshToken(
			{ useAccountCookie: true },
			{ headers },
		);
		expect(refreshTokenResponse.error?.message).toBe(
			BASE_ERROR_CODES.ACCOUNT_NOT_FOUND.message,
		);
	});

	it.each([
		{
			name: "getAccessToken auto-refresh",
			request: (
				client: Awaited<ReturnType<typeof getTestInstance>>["client"],
				accountId: string,
				headers: Headers,
			) => client.getAccessToken({ accountId }, { headers }),
		},
		{
			name: "refreshToken",
			request: (
				client: Awaited<ReturnType<typeof getTestInstance>>["client"],
				accountId: string,
				headers: Headers,
			) => client.refreshToken({ accountId }, { headers }),
		},
	])("should not release refreshed credentials when $name races with unlinking", async ({
		request,
	}) => {
		const { auth, client, signInWithTestUser } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});
		const testContext = await auth.$context;
		const provider = testContext.socialProviders.find(
			(candidate) => candidate.id === "google",
		);
		assert(provider?.refreshAccessToken, "Google should support token refresh");

		let signalRefreshStarted: () => void = () => {};
		const refreshStarted = new Promise<void>((resolve) => {
			signalRefreshStarted = resolve;
		});
		let releaseRefresh: () => void = () => {};
		const refreshMayFinish = new Promise<void>((resolve) => {
			releaseRefresh = resolve;
		});
		const refreshSpy = vi
			.spyOn(provider, "refreshAccessToken")
			.mockImplementation(async () => {
				signalRefreshStarted();
				await refreshMayFinish;
				return {
					accessToken: "unlinked-refreshed-access-token",
					refreshToken: "unlinked-refreshed-refresh-token",
				};
			});

		const { runWithUser, user } = await signInWithTestUser();
		const linked = await testContext.internalAdapter.linkAccount(
			user.id,
			{
				issuer: "https://accounts.google.com",
				providerAccountId: `unlink-race-${crypto.randomUUID()}`,
			},
			{
				providerId: "google",
				providerInstanceId: "google",
				accessToken: "expired-access-token",
				refreshToken: "current-refresh-token",
				accessTokenExpiresAt: new Date(Date.now() - 1_000),
			},
		);

		await runWithUser(async (headers) => {
			const responsePromise = request(client, linked.account.id, headers);
			await refreshStarted;
			await testContext.internalAdapter.deleteAccount(linked.account.id);
			releaseRefresh();
			const response = await responsePromise;

			expect(response.data).toBeNull();
			expect(response.error?.message).toBe(
				BASE_ERROR_CODES.ACCOUNT_NOT_FOUND.message,
			);
		});

		expect(refreshSpy).toHaveBeenCalledOnce();
		await expect(
			testContext.internalAdapter.findAccountWithIdentityById(
				linked.account.id,
			),
		).resolves.toBeNull();
	});

	it("should resolve a local account ID from the database instead of the account cookie", async () => {
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

		const accounts = await client.listAccounts({
			fetchOptions: { headers },
		});
		const googleAccount = accounts.data?.find((a) => a.providerId === "google");
		assert(googleAccount, "google account should exist");
		assert(googleAccount.id !== googleAccount.identity.providerAccountId);

		const findAccountByIdSpy = vi.spyOn(
			testCtx.internalAdapter,
			"findAccountWithIdentityById",
		);

		const accessTokenRes = await client.getAccessToken(
			{
				accountId: googleAccount.id,
			},
			{
				headers,
			},
		);

		expect(accessTokenRes.data?.accessToken).toBe("test");
		// Row-ID selection is authoritative and cannot be satisfied by cached
		// account-cookie data, even when the cookie contains the same ID.
		expect(findAccountByIdSpy).toHaveBeenCalledWith(googleAccount.id);
		findAccountByIdSpy.mockRestore();
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
		const { account: secondUserAccount } =
			await testCtx.internalAdapter.linkAccount(
				session.user.id,
				{
					issuer: "https://accounts.google.com",
					providerAccountId: "second-google-sub",
				},
				{
					providerId: "google",
					providerInstanceId: "google",
					accessToken: "second-access-token",
					refreshToken: "second-refresh-token",
					scope: "email",
				},
			);

		const res = await client.refreshToken(
			{
				accountId: secondUserAccount.id,
			},
			{ headers },
		);

		// The refresh must use the second user's own refresh token, not the
		// the first user's token from the stale cookie
		expect(refreshedWith).toBe("second-refresh-token");
		expect(res.data?.refreshToken).not.toBe("first-refresh-token");

		// The second user's account row must not be overwritten with the
		// the first user's tokens
		const accounts = await testCtx.internalAdapter.listUserAccounts(
			session.user.id,
		);
		const googleAccount = accounts.find(
			({ account }) => account.providerId === "google",
		);
		expect(googleAccount?.account.refreshToken).toBe("second-refresh-token");
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
		const linkedAccounts = await client.listAccounts({
			fetchOptions: { headers },
		});
		const googleAccount = linkedAccounts.data?.find(
			(account) => account.providerId === "google",
		);
		assert(googleAccount, "google account should be listed");

		const firstAccessToken = await client.getAccessToken(
			{
				accountId: googleAccount.id,
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
				accountId: googleAccount.id,
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
			{ useAccountCookie: true },
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
			account: {
				idToken: newIdToken,
			},
		});

		const secondAccessToken = await client.getAccessToken(
			{ useAccountCookie: true },
			{ headers },
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
			{ useAccountCookie: true },
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
			account: {
				accessToken: "refreshed-cognito-access-token",
				idToken: refreshedIdToken,
				refreshToken: "cognito-refresh-token",
			},
		});

		const refreshTokenResponse = await client.refreshToken(
			{ useAccountCookie: true },
			{ headers },
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
			{ useAccountCookie: true },
			{ headers },
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
			{ useAccountCookie: true },
			{ headers },
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
					account: {
						accessToken: "test",
						refreshToken: "test",
						providerId: "google",
					},
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
			{ useAccountCookie: true },
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
			{ useAccountCookie: true },
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

/**
 * @see https://github.com/better-auth/better-auth/issues/9732
 */
describe("validateUserInfo account linking", async () => {
	let validatedUserId: string | undefined;
	const { signInWithTestUser, client } = await getTestInstance({
		user: {
			validateUserInfo({ user, source }) {
				if (source.action !== "link-account") {
					return;
				}
				validatedUserId = user.id;
				expect(source.method).toBe("oauth");
				expect(source.oauth?.providerId).toBe("google");
				return {
					error: "domain_blocked",
					errorDescription: "This email domain is not allowed",
				};
			},
		},
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
		},
	});

	const { runWithUser, user } = await signInWithTestUser();

	it("should reject account linking when validateUserInfo returns error", async () => {
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
						const state = cookies.get("better-auth.state")?.value;
						headers.set(
							"cookie",
							`${headers.get("cookie") || ""}; better-auth.state=${state}`,
						);
					},
				},
			);
			const state =
				linkAccountRes.data && "url" in linkAccountRes.data
					? new URL(linkAccountRes.data.url).searchParams.get("state") || ""
					: "";
			email = "blocked@example.com";
			let redirectLocation = "";
			await client.$fetch("/callback/google", {
				query: {
					state,
					code: "test",
				},
				method: "GET",
				onError(context) {
					redirectLocation = context.response.headers.get("location") || "";
				},
			});

			expect(redirectLocation).toContain("error=domain_blocked");
			expect(redirectLocation).toContain(
				"error_description=This+email+domain+is+not+allowed",
			);
			expect(validatedUserId).toBe(user.id);

			const accounts = await client.listAccounts();
			expect(accounts.data).toHaveLength(1);
		});
	});
});

describe("account selector validation", async () => {
	const { auth, signInWithTestUser } = await getTestInstance();
	const { headers: sessionHeaders } = await signInWithTestUser();

	const requestHeaders = () => {
		const headers = new Headers(sessionHeaders);
		headers.set("content-type", "application/json");
		return headers;
	};

	it("rejects requests that provide both account selectors over HTTP", async () => {
		const responses = await Promise.all([
			auth.handler(
				new Request("http://localhost:3000/api/auth/get-access-token", {
					method: "POST",
					headers: requestHeaders(),
					body: JSON.stringify({
						accountId: "account-id",
						useAccountCookie: true,
					}),
				}),
			),
			auth.handler(
				new Request("http://localhost:3000/api/auth/refresh-token", {
					method: "POST",
					headers: requestHeaders(),
					body: JSON.stringify({
						accountId: "account-id",
						useAccountCookie: true,
					}),
				}),
			),
			auth.handler(
				new Request(
					"http://localhost:3000/api/auth/account-info?accountId=account-id&useAccountCookie=true",
					{ headers: requestHeaders() },
				),
			),
		]);

		expect(responses.map((response) => response.status)).toEqual([
			400, 400, 400,
		]);
	});

	it("rejects requests that omit an account selector over HTTP", async () => {
		const responses = await Promise.all([
			auth.handler(
				new Request("http://localhost:3000/api/auth/get-access-token", {
					method: "POST",
					headers: requestHeaders(),
					body: JSON.stringify({}),
				}),
			),
			auth.handler(
				new Request("http://localhost:3000/api/auth/refresh-token", {
					method: "POST",
					headers: requestHeaders(),
					body: JSON.stringify({}),
				}),
			),
			auth.handler(
				new Request("http://localhost:3000/api/auth/account-info", {
					headers: requestHeaders(),
				}),
			),
		]);

		expect(responses.map((response) => response.status)).toEqual([
			400, 400, 400,
		]);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/9967
 */
describe("token routes cookie cache revocation", async () => {
	const preloadProviderTokenSessionPlugin = {
		id: "preload-provider-token-session",
		hooks: {
			before: [
				{
					matcher(ctx) {
						return [
							"/get-access-token",
							"/refresh-token",
							"/account-info",
						].includes(ctx.path ?? "");
					},
					handler: createAuthMiddleware(async (ctx) => {
						await getSessionFromCtx(ctx);
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;

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
			body: { useAccountCookie: true },
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
				body: { useAccountCookie: true },
				headers,
			},
		);
		expect(bypass.error?.status).toBe(401);
	});

	it("rejects every token route after a hook preloads a revoked cached session", async () => {
		const { auth, client, testUser, cookieSetter } = await getTestInstance({
			plugins: [preloadProviderTokenSessionPlugin],
			session: { cookieCache: { enabled: true, maxAge: 60 } },
		});
		const headers = new Headers();
		await client.signIn.email(
			{ email: testUser.email, password: testUser.password },
			{ onSuccess: cookieSetter(headers) },
		);
		const session = await auth.api.getSession({ headers });
		assert(session, "expected a cached session");
		await (await auth.$context).internalAdapter.deleteSession(
			session.session.token,
		);

		const postHeaders = new Headers(headers);
		postHeaders.set("content-type", "application/json");
		const responses = await Promise.all([
			auth.handler(
				new Request("http://localhost:3000/api/auth/get-access-token", {
					method: "POST",
					headers: postHeaders,
					body: JSON.stringify({ useAccountCookie: true }),
				}),
			),
			auth.handler(
				new Request("http://localhost:3000/api/auth/refresh-token", {
					method: "POST",
					headers: postHeaders,
					body: JSON.stringify({ useAccountCookie: true }),
				}),
			),
			auth.handler(
				new Request(
					"http://localhost:3000/api/auth/account-info?useAccountCookie=true",
					{ headers },
				),
			),
		]);

		expect(responses.map((response) => response.status)).toEqual([
			401, 401, 401,
		]);
	});
});

describe("provider account binding across same-user session rotation", async () => {
	type CookieJar = Map<string, string>;
	type HttpAuth = {
		handler: (request: Request) => Promise<Response>;
	};

	const collectResponseCookies = (response: Response, jar: CookieJar) => {
		for (const cookie of response.headers.getSetCookie()) {
			const [pair = ""] = cookie.split(";");
			const separatorIndex = pair.indexOf("=");
			if (separatorIndex > 0) {
				jar.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
			}
		}
	};

	const jarFromHeaders = (headers: Headers): CookieJar => {
		const jar: CookieJar = new Map();
		for (const pair of (headers.get("cookie") ?? "").split(";")) {
			const separatorIndex = pair.indexOf("=");
			if (separatorIndex > 0) {
				jar.set(
					pair.slice(0, separatorIndex).trim(),
					pair.slice(separatorIndex + 1),
				);
			}
		}
		return jar;
	};

	const headersFromJar = (jar: CookieJar) =>
		new Headers({
			cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
			host: "localhost:3000",
		});

	const linkGoogleAccount = async (
		auth: HttpAuth,
		jar: CookieJar,
		userEmail: string,
	) => {
		const linkHeaders = headersFromJar(jar);
		linkHeaders.set("content-type", "application/json");
		const linkResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/link-social", {
				method: "POST",
				headers: linkHeaders,
				body: JSON.stringify({
					provider: "google",
					callbackURL: "/linked",
					disableRedirect: true,
				}),
			}),
		);
		expect(linkResponse.status).toBe(200);
		collectResponseCookies(linkResponse, jar);
		const { url } = (await linkResponse.json()) as { url: string };
		const state = new URL(url).searchParams.get("state");
		assert(state, "expected linkSocial to issue OAuth state");
		email = userEmail;
		const callbackResponse = await auth.handler(
			new Request(
				`http://localhost:3000/api/auth/callback/google?code=test&state=${state}`,
				{ headers: headersFromJar(jar), redirect: "manual" },
			),
		);
		expect(callbackResponse.status).toBe(302);
		collectResponseCookies(callbackResponse, jar);
	};

	const expectProviderAccess = async (auth: HttpAuth, jar: CookieJar) => {
		const headers = headersFromJar(jar);
		headers.set("content-type", "application/json");
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-access-token", {
				method: "POST",
				headers,
				body: JSON.stringify({ useAccountCookie: true }),
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ accessToken: "test" });
	};

	it("preserves provider access when a password change revokes the current session", async () => {
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			account: { storeAccountCookie: true },
			socialProviders: {
				google: { clientId: "test", clientSecret: "test" },
			},
		});
		const { headers } = await signInWithTestUser();
		const jar = jarFromHeaders(headers);
		await linkGoogleAccount(auth, jar, testUser.email);

		const changeHeaders = headersFromJar(jar);
		changeHeaders.set("content-type", "application/json");
		const changeResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/change-password", {
				method: "POST",
				headers: changeHeaders,
				body: JSON.stringify({
					currentPassword: testUser.password,
					newPassword: "new-password123456",
					revokeOtherSessions: true,
				}),
			}),
		);
		expect(changeResponse.status).toBe(200);
		collectResponseCookies(changeResponse, jar);
		await expectProviderAccess(auth, jar);
	});

	it("preserves provider access when two-factor enrollment and removal rotate the session", async () => {
		const { auth, signInWithTestUser, testUser } = await getTestInstance({
			account: { storeAccountCookie: true },
			plugins: [twoFactor({ skipVerificationOnEnable: true })],
			socialProviders: {
				google: { clientId: "test", clientSecret: "test" },
			},
		});
		const { headers } = await signInWithTestUser();
		const jar = jarFromHeaders(headers);
		await linkGoogleAccount(auth, jar, testUser.email);

		const enableHeaders = headersFromJar(jar);
		enableHeaders.set("content-type", "application/json");
		const enableResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/two-factor/enable", {
				method: "POST",
				headers: enableHeaders,
				body: JSON.stringify({
					password: testUser.password,
					method: "totp",
				}),
			}),
		);
		expect(enableResponse.status).toBe(200);
		collectResponseCookies(enableResponse, jar);
		await expectProviderAccess(auth, jar);

		const disableHeaders = headersFromJar(jar);
		disableHeaders.set("content-type", "application/json");
		const disableResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/two-factor/disable", {
				method: "POST",
				headers: disableHeaders,
				body: JSON.stringify({ password: testUser.password }),
			}),
		);
		expect(disableResponse.status).toBe(200);
		collectResponseCookies(disableResponse, jar);
		await expectProviderAccess(auth, jar);
	});
});

describe("account resolution in stateless mode", async () => {
	const IDP = "https://idp.stateless.test";
	const STATELESS_SECRET = "stateless-test-secret-stateless-test-secret";
	const preloadProviderTokenSessionPlugin = {
		id: "preload-stateless-provider-token-session",
		hooks: {
			before: [
				{
					matcher(ctx) {
						return [
							"/get-access-token",
							"/refresh-token",
							"/account-info",
						].includes(ctx.path ?? "");
					},
					handler: createAuthMiddleware(async (ctx) => {
						await getSessionFromCtx(ctx);
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;

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

	const makeStatelessAuth = (
		providerAccountId = "shared-idp-user",
		secondaryStorage?: SecondaryStorage,
		providerId = "idp",
	) =>
		betterAuth({
			secret: STATELESS_SECRET,
			baseURL: "http://localhost:3000",
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: { enabled: true },
			...(secondaryStorage ? { secondaryStorage } : {}),
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwe" as const,
					maxAge: 60,
					refreshCache: { updateAge: 60 * 60 },
				},
			},
			account: { storeStateStrategy: "cookie", storeAccountCookie: true },
			plugins: [
				preloadProviderTokenSessionPlugin,
				genericOAuth({
					config: [
						{
							providerId,
							clientId: "client-id",
							clientSecret: "client-secret",
							scopes: ["openid", "profile", "email"],
							discoveryUrl: `${IDP}/.well-known/openid-configuration`,
							getUserInfo: async (tokens) => ({
								id: providerAccountId,
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

	const signUpCredentialUser = async (
		auth: ReturnType<typeof makeStatelessAuth>,
	) => {
		const jar: Jar = new Map();
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Credential User",
					email: "user@stateless.test",
					password: "password123456",
				}),
			}),
		);
		expect(response.status).toBe(200);
		collectCookies(response, jar);
		return jar;
	};

	const requestAccountAccessToken = async (
		auth: ReturnType<typeof makeStatelessAuth>,
		jar: Jar,
	) => {
		const headers = requestHeaders(jar);
		headers.set("content-type", "application/json");
		return auth.handler(
			new Request("http://localhost:3000/api/auth/get-access-token", {
				method: "POST",
				headers,
				body: JSON.stringify({ useAccountCookie: true }),
			}),
		);
	};

	const expectAccountNotFound = async (response: Response) => {
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
	};

	const signIn = async (auth: ReturnType<typeof makeStatelessAuth>) => {
		const jar: Jar = new Map();
		const providerId = (await auth.$context).socialProviders[0]?.id;
		assert(providerId, "expected an OAuth provider");
		let res = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/social", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					provider: providerId,
					callbackURL: "/",
					disableRedirect: true,
				}),
			}),
		);
		collectCookies(res, jar);
		const { url } = (await res.json()) as { url: string };
		const state = new URL(url).searchParams.get("state");
		assert(state, "expected an OAuth state to be issued");

		res = await auth.handler(
			new Request(
				`http://localhost:3000/api/auth/callback/${providerId}?code=test-code&state=${state}`,
				{ headers: requestHeaders(jar), redirect: "manual" },
			),
		);
		collectCookies(res, jar);

		const session = (await auth.api.getSession({
			headers: requestHeaders(jar),
		})) as { session: { token: string }; user: { id: string } } | null;
		assert(session?.user.id, "expected OAuth sign-in to create a session");
		return {
			jar,
			sessionToken: session.session.token,
			userId: session.user.id,
		};
	};

	const signInOnTwoInstances = async (
		firstProviderAccountId = "shared-idp-user",
		secondProviderAccountId = "shared-idp-user",
		firstProviderId = "idp",
		secondProviderId = "idp",
	) => {
		const authA = makeStatelessAuth(
			firstProviderAccountId,
			undefined,
			firstProviderId,
		);
		const a = await signIn(authA);
		const b = await signIn(
			makeStatelessAuth(secondProviderAccountId, undefined, secondProviderId),
		);
		expect(a.userId).not.toBe(b.userId);

		const accountCookieName = (await authA.$context).authCookies.accountData
			.name;
		const providerAccountBindingCookieName = (await authA.$context).authCookies
			.providerAccountBinding.name;
		const mixed: Jar = new Map(a.jar);
		for (const key of [...mixed.keys()]) {
			if (key.startsWith(accountCookieName)) mixed.delete(key);
		}
		for (const [key, value] of b.jar) {
			if (key.startsWith(accountCookieName)) mixed.set(key, value);
		}
		const foreignBindingMixed = new Map(mixed);
		for (const [key, value] of b.jar) {
			if (key === providerAccountBindingCookieName) {
				foreignBindingMixed.set(key, value);
			}
		}

		return {
			accountCookieName,
			foreignBindingMixed,
			mixed,
			sessionUserId: a.userId,
		};
	};

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9978
	 */
	it("rejects an account cookie copied from another session with the same upstream identity", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances();
		const headers = requestHeaders(mixed);
		headers.set("content-type", "application/json");

		const response = await makeStatelessAuth().handler(
			new Request("http://localhost:3000/api/auth/get-access-token", {
				method: "POST",
				headers,
				body: JSON.stringify({
					useAccountCookie: true,
					userId: sessionUserId,
				}),
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
	});

	it("rejects an Identity proof copied from a different session", async () => {
		const { foreignBindingMixed, sessionUserId } = await signInOnTwoInstances();
		const headers = requestHeaders(foreignBindingMixed);
		headers.set("content-type", "application/json");
		const response = await makeStatelessAuth().handler(
			new Request("http://localhost:3000/api/auth/get-access-token", {
				method: "POST",
				headers,
				body: JSON.stringify({
					useAccountCookie: true,
					userId: sessionUserId,
				}),
			}),
		);

		await expectAccountNotFound(response);
	});

	it("rejects an account cookie from another provider instance for the same identity", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances(
			"shared-idp-user",
			"shared-idp-user",
			"idp-primary",
			"idp-secondary",
		);
		const headers = requestHeaders(mixed);
		headers.set("content-type", "application/json");
		const response = await makeStatelessAuth(
			"shared-idp-user",
			undefined,
			"idp-primary",
		).handler(
			new Request("http://localhost:3000/api/auth/get-access-token", {
				method: "POST",
				headers,
				body: JSON.stringify({
					useAccountCookie: true,
					userId: sessionUserId,
				}),
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
	});

	it("allows every token route with the complete session-bound account cookies", async () => {
		const auth = makeStatelessAuth();
		const { jar } = await signIn(auth);
		const postHeaders = requestHeaders(jar);
		postHeaders.set("content-type", "application/json");
		const responses = await Promise.all([
			auth.handler(
				new Request("http://localhost:3000/api/auth/get-access-token", {
					method: "POST",
					headers: postHeaders,
					body: JSON.stringify({ useAccountCookie: true }),
				}),
			),
			auth.handler(
				new Request("http://localhost:3000/api/auth/refresh-token", {
					method: "POST",
					headers: postHeaders,
					body: JSON.stringify({ useAccountCookie: true }),
				}),
			),
			auth.handler(
				new Request(
					"http://localhost:3000/api/auth/account-info?useAccountCookie=true",
					{ headers: requestHeaders(jar) },
				),
			),
		]);

		expect(responses.map((response) => response.status)).toEqual([
			200, 200, 200,
		]);
	});

	it("keeps provider access bound to the session after refreshing provider tokens", async () => {
		const auth = makeStatelessAuth();
		const { jar } = await signIn(auth);
		const headers = requestHeaders(jar);
		headers.set("content-type", "application/json");

		const refreshResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/refresh-token", {
				method: "POST",
				headers,
				body: JSON.stringify({ useAccountCookie: true }),
			}),
		);
		expect(refreshResponse.status).toBe(200);

		const context = await auth.$context;
		const refreshedCookies = parseSetCookieHeader(
			refreshResponse.headers.get("set-cookie") ?? "",
		);
		expect(
			refreshedCookies.get(context.authCookies.accountData.name)?.value,
		).toBeTruthy();
		expect(
			refreshedCookies.get(context.authCookies.providerAccountBinding.name)
				?.value,
		).toBeTruthy();
		collectCookies(refreshResponse, jar);

		const accessTokenResponse = await requestAccountAccessToken(auth, jar);
		expect(accessTokenResponse.status).toBe(200);
		expect(await accessTokenResponse.json()).toMatchObject({
			accessToken: "idp-refreshed-access-token",
		});
	});

	it("resolves getAccessToken after a secondary-storage session is authoritatively reloaded", async () => {
		const values = new Map<string, string>();
		const secondaryStorage: SecondaryStorage = {
			get: async (key) => values.get(key) ?? null,
			getAndDelete: async (key) => {
				const value = values.get(key) ?? null;
				values.delete(key);
				return value;
			},
			increment: async (key) => {
				const next = Number(values.get(key) ?? 0) + 1;
				values.set(key, String(next));
				return next;
			},
			set: async (key, value) => {
				values.set(key, value);
			},
			delete: async (key) => {
				values.delete(key);
			},
		};
		const auth = makeStatelessAuth("secondary-storage-user", secondaryStorage);
		const { jar, userId } = await signIn(auth);

		const headers = requestHeaders(jar);
		headers.set("content-type", "application/json");
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-access-token", {
				method: "POST",
				headers,
				body: JSON.stringify({ useAccountCookie: true, userId }),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			accessToken: "idp-access-token",
		});
	});

	it("rejects every token route after a secondary-storage session is revoked", async () => {
		const values = new Map<string, string>();
		const secondaryStorage: SecondaryStorage = {
			get: async (key) => values.get(key) ?? null,
			getAndDelete: async (key) => {
				const value = values.get(key) ?? null;
				values.delete(key);
				return value;
			},
			increment: async (key) => {
				const next = Number(values.get(key) ?? 0) + 1;
				values.set(key, String(next));
				return next;
			},
			set: async (key, value) => {
				values.set(key, value);
			},
			delete: async (key) => {
				values.delete(key);
			},
		};
		const auth = makeStatelessAuth("secondary-revoked-user", secondaryStorage);
		const { jar, sessionToken } = await signIn(auth);
		await (await auth.$context).internalAdapter.deleteSession(sessionToken);

		const postHeaders = requestHeaders(jar);
		postHeaders.set("content-type", "application/json");
		const responses = await Promise.all([
			auth.handler(
				new Request("http://localhost:3000/api/auth/get-access-token", {
					method: "POST",
					headers: postHeaders,
					body: JSON.stringify({ useAccountCookie: true }),
				}),
			),
			auth.handler(
				new Request("http://localhost:3000/api/auth/refresh-token", {
					method: "POST",
					headers: postHeaders,
					body: JSON.stringify({ useAccountCookie: true }),
				}),
			),
			auth.handler(
				new Request(
					"http://localhost:3000/api/auth/account-info?useAccountCookie=true",
					{ headers: requestHeaders(jar) },
				),
			),
		]);

		expect(responses.map((response) => response.status)).toEqual([
			401, 401, 401,
		]);
	});

	it("binds a redirect-linked provider account to the existing stateless session", async () => {
		const auth = makeStatelessAuth("redirect-linked-user");
		const jar = await signUpCredentialUser(auth);
		const linkHeaders = requestHeaders(jar);
		linkHeaders.set("content-type", "application/json");
		const linkResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/link-social", {
				method: "POST",
				headers: linkHeaders,
				body: JSON.stringify({
					provider: "idp",
					callbackURL: "/linked",
					disableRedirect: true,
				}),
			}),
		);
		expect(linkResponse.status).toBe(200);
		collectCookies(linkResponse, jar);
		const { url } = (await linkResponse.json()) as { url: string };
		const state = new URL(url).searchParams.get("state");
		assert(state, "expected linkSocial to issue OAuth state");

		const callbackResponse = await auth.handler(
			new Request(
				`http://localhost:3000/api/auth/callback/idp?code=test-code&state=${state}`,
				{ headers: requestHeaders(jar), redirect: "manual" },
			),
		);
		expect(callbackResponse.status).toBe(302);
		collectCookies(callbackResponse, jar);

		const tokenResponse = await requestAccountAccessToken(auth, jar);
		expect(tokenResponse.status).toBe(200);
		expect(await tokenResponse.json()).toMatchObject({
			accessToken: "idp-access-token",
		});
	});

	it("binds a direct ID-token-linked provider account to the existing stateless session", async () => {
		const auth = makeStatelessAuth("direct-linked-user");
		const provider = (await auth.$context).socialProviders.find(
			(candidate) => candidate.id === "idp",
		);
		assert(provider, "expected the generic OAuth provider");
		Object.assign(provider, {
			options: { ...provider.options, verifyIdToken: async () => true },
		});
		const jar = await signUpCredentialUser(auth);
		const linkHeaders = requestHeaders(jar);
		linkHeaders.set("content-type", "application/json");
		const linkResponse = await auth.handler(
			new Request("http://localhost:3000/api/auth/link-social", {
				method: "POST",
				headers: linkHeaders,
				body: JSON.stringify({
					provider: "idp",
					idToken: {
						token: "verified-id-token",
						accessToken: "direct-access-token",
						refreshToken: "direct-refresh-token",
					},
				}),
			}),
		);
		expect(linkResponse.status).toBe(200);
		collectCookies(linkResponse, jar);

		const tokenResponse = await requestAccountAccessToken(auth, jar);
		expect(tokenResponse.status).toBe(200);
		expect(await tokenResponse.json()).toMatchObject({
			accessToken: "direct-access-token",
		});
	});

	it("rejects getAccessToken when the session and account cookie represent different upstream identities", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances(
			"first-idp-user",
			"second-idp-user",
		);
		const headers = requestHeaders(mixed);
		headers.set("content-type", "application/json");
		const response = await makeStatelessAuth("first-idp-user").handler(
			new Request("http://localhost:3000/api/auth/get-access-token", {
				method: "POST",
				headers,
				body: JSON.stringify({
					useAccountCookie: true,
					userId: sessionUserId,
				}),
			}),
		);

		await expectAccountNotFound(response);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9978
	 */
	it("rejects accountInfo with an account cookie copied from another session", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances();
		const response = await makeStatelessAuth().handler(
			new Request(
				`http://localhost:3000/api/auth/account-info?useAccountCookie=true&userId=${sessionUserId}`,
				{ headers: requestHeaders(mixed) },
			),
		);

		await expectAccountNotFound(response);
	});

	it("rejects accountInfo when the session and account cookie represent different upstream identities", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances(
			"first-idp-user",
			"second-idp-user",
		);
		const response = await makeStatelessAuth("first-idp-user").handler(
			new Request(
				`http://localhost:3000/api/auth/account-info?useAccountCookie=true&userId=${sessionUserId}`,
				{ headers: requestHeaders(mixed) },
			),
		);

		await expectAccountNotFound(response);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9978
	 */
	it("rejects refreshToken with an account cookie copied from another session", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances();
		const headers = requestHeaders(mixed);
		headers.set("content-type", "application/json");
		const response = await makeStatelessAuth().handler(
			new Request("http://localhost:3000/api/auth/refresh-token", {
				method: "POST",
				headers,
				body: JSON.stringify({
					useAccountCookie: true,
					userId: sessionUserId,
				}),
			}),
		);

		await expectAccountNotFound(response);
	});

	it("rejects refreshToken when the session and account cookie represent different upstream identities", async () => {
		const { mixed, sessionUserId } = await signInOnTwoInstances(
			"first-idp-user",
			"second-idp-user",
		);
		const headers = requestHeaders(mixed);
		headers.set("content-type", "application/json");
		const response = await makeStatelessAuth("first-idp-user").handler(
			new Request("http://localhost:3000/api/auth/refresh-token", {
				method: "POST",
				headers,
				body: JSON.stringify({
					useAccountCookie: true,
					userId: sessionUserId,
				}),
			}),
		);

		await expectAccountNotFound(response);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9978
	 */
	it("expires a copied account cookie during stateless session refresh", async () => {
		const { accountCookieName, mixed } = await signInOnTwoInstances();

		const res = await makeStatelessAuth().handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: requestHeaders(mixed),
			}),
		);
		expect(res.status).toBe(200);

		const setCookieHeader = res.headers.get("set-cookie") || "";
		expect(setCookieHeader).toContain(`${accountCookieName}=`);
		const cookies = parseSetCookieHeader(setCookieHeader);
		const accountCookie = cookies.get(accountCookieName);
		expect(accountCookie?.value).toBeFalsy();
		expect(accountCookie?.["max-age"]).toBe(0);
	});

	it("expires an account cookie for a different upstream identity during stateless session refresh", async () => {
		const { accountCookieName, mixed } = await signInOnTwoInstances(
			"first-idp-user",
			"second-idp-user",
		);

		const res = await makeStatelessAuth("first-idp-user").handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: requestHeaders(mixed),
			}),
		);
		expect(res.status).toBe(200);

		const setCookieHeader = res.headers.get("set-cookie") || "";
		expect(setCookieHeader).toContain(`${accountCookieName}=`);
		const cookies = parseSetCookieHeader(setCookieHeader);
		const accountCookie = cookies.get(accountCookieName);
		expect(accountCookie?.value).toBeFalsy();
		expect(accountCookie?.["max-age"]).toBe(0);
	});

	it("expires the bound account cookie when a stateless session signs out", async () => {
		const auth = makeStatelessAuth();
		const { jar } = await signIn(auth);
		const accountCookieName = (await auth.$context).authCookies.accountData
			.name;

		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-out", {
				method: "POST",
				headers: requestHeaders(jar),
			}),
		);
		expect(res.status).toBe(200);

		const accountCookie = parseSetCookieHeader(
			res.headers.get("set-cookie") || "",
		).get(accountCookieName);
		expect(accountCookie?.value).toBeFalsy();
		expect(accountCookie?.["max-age"]).toBe(0);
	});

	it("expires the OAuth account cookie when a new credential session replaces the stateless session", async () => {
		const auth = makeStatelessAuth();
		const { jar } = await signIn(auth);
		const accountCookieName = (await auth.$context).authCookies.accountData
			.name;
		const headers = requestHeaders(jar);
		headers.set("content-type", "application/json");

		const res = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-up/email", {
				method: "POST",
				headers,
				body: JSON.stringify({
					name: "Credential User",
					email: "credential-user@stateless.test",
					password: "password123456",
				}),
			}),
		);
		expect(res.status).toBe(200);

		const accountCookie = parseSetCookieHeader(
			res.headers.get("set-cookie") || "",
		).get(accountCookieName);
		expect(accountCookie?.value).toBeFalsy();
		expect(accountCookie?.["max-age"]).toBe(0);
	});
});
