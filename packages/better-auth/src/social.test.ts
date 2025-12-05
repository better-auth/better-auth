import type { GenericEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";
import { refreshAccessToken } from "@better-auth/core/oauth2";
import type {
	GoogleProfile,
	VercelProfile,
} from "@better-auth/core/social-providers";
import { betterFetch } from "@better-fetch/fetch";
import Database from "better-sqlite3";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuthMiddleware, getOAuthState } from "./api";
import { parseSetCookieHeader } from "./cookies";
import { signJWT } from "./crypto";
import { getMigrations } from "./db";
import { getTestInstance } from "./test-utils/test-instance";
import { DEFAULT_SECRET } from "./utils/constants";

let server = new OAuth2Server();
let port = 8005;

const mswServer = setupServer();
let shouldUseUpdatedProfile = false;

beforeAll(async () => {
	mswServer.listen({ onUnhandledRequest: "bypass" });
	mswServer.use(
		http.post("https://oauth2.googleapis.com/token", async () => {
			const data: GoogleProfile = shouldUseUpdatedProfile
				? {
						email: "user@email.com",
						email_verified: true,
						name: "Updated User",
						picture: "https://test.com/picture.png",
						exp: 1234567890,
						sub: "1234567890",
						iat: 1234567890,
						aud: "test",
						azp: "test",
						nbf: 1234567890,
						iss: "test",
						locale: "en",
						jti: "test",
						given_name: "Updated",
						family_name: "User",
					}
				: {
						email: "user@email.com",
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
		http.post(`http://localhost:${port}/token`, async () => {
			const data: GoogleProfile = {
				email: "user@email.com",
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
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				id_token: testIdToken,
				token_type: "Bearer",
				expires_in: 3600,
			});
		}),
	);
});

afterEach(() => {
	shouldUseUpdatedProfile = false;
});

afterAll(() => mswServer.close());

describe("Social Providers", async (c) => {
	const { client, cookieSetter } = await getTestInstance(
		{
			user: {
				additionalFields: {
					firstName: {
						type: "string",
					},
					lastName: {
						type: "string",
					},
					isOAuth: {
						type: "boolean",
					},
				},
			},
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					mapProfileToUser(profile) {
						return {
							firstName: profile.given_name,
							lastName: profile.family_name,
							isOAuth: true,
						};
					},
				},
				apple: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		},
		{
			disableTestUser: true,
		},
	);

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.issuer.on;
		await server.start(port, "localhost");
		console.log("Issuer URL:", server.issuer.url); // -> http://localhost:${port}
	});
	afterAll(async () => {
		await server.stop().catch(console.error);
	});
	server.service.on("beforeResponse", (tokenResponse, req) => {
		tokenResponse.body = {
			accessToken: "access-token",
			refreshToken: "refresher-token",
		};
		tokenResponse.statusCode = 200;
	});
	server.service.on("beforeUserinfo", (userInfoResponse, req) => {
		userInfoResponse.body = {
			email: "test@localhost.com",
			name: "OAuth2 Test",
			sub: "oauth2",
			picture: "https://test.com/picture.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	server.service.on("beforeTokenSigning", (token, req) => {
		token.payload.email = "sso-user@localhost:8000.com";
		token.payload.email_verified = true;
		token.payload.name = "Test User";
		token.payload.picture = "https://test.com/picture.png";
	});

	const headers = new Headers();
	async function simulateOAuthFlowRefresh(
		authUrl: string,
		headers: Headers,
		fetchImpl?: ((...args: any) => any) | undefined,
	) {
		let location: string | null = null;
		await betterFetch(authUrl, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location");
			},
		});
		if (!location) throw new Error("No redirect location found");

		const tokens = await refreshAccessToken({
			refreshToken: "mock-refresh-token",
			options: {
				clientId: "test-client-id",
				clientKey: "test-client-key",
				clientSecret: "test-client-secret",
			},
			tokenEndpoint: `http://localhost:${port}/token`,
		});
		return tokens;
	}
	it("should be able to add social providers", async () => {
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
	});

	it("should be able to sign in with social providers", async () => {
		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
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
				expect(location).toContain("/welcome");
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				expect(cookies.get("better-auth.session_token")?.value).toBeDefined();
			},
		});
	});

	it("Should use callback URL if the user is already registered", async () => {
		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

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
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				expect(cookies.get("better-auth.session_token")?.value).toBeDefined();
			},
		});
	});

	it("should be able to map profile to user", async () => {
		const headers = new Headers();
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
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError: (c) => {
				//TODO: fix this
				cookieSetter(headers)(c as any);
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user).toMatchObject({
			isOAuth: true,
			firstName: "First",
			lastName: "Last",
		});
	});

	it("should be protected from callback URL attacks", async () => {
		const signInRes = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "https://evil.com/callback",
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

		expect(signInRes.error?.status).toBe(403);
		expect(signInRes.error?.message).toBe("Invalid callbackURL");
	});

	it("should refresh the access token", async () => {
		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
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
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				cookieSetter(headers)(context as any);
				expect(cookies.get("better-auth.session_token")?.value).toBeDefined();
			},
		});
		const accounts = await client.listAccounts({
			fetchOptions: { headers },
		});
		await client.$fetch("/refresh-token", {
			body: {
				accountId: "test-id",
				providerId: "google",
			},
			headers,
			method: "POST",
			onError(context) {
				cookieSetter(headers)(context as any);
			},
		});

		const authUrl = signInRes.data?.url;
		if (!authUrl) throw new Error("No auth url found");
		const mockEndpoint = authUrl.replace(
			"https://accounts.google.com/o/oauth2/auth",
			`http://localhost:${port}/authorize`,
		);
		const result = await simulateOAuthFlowRefresh(mockEndpoint, headers);
		const { accessToken, refreshToken } = result;
		expect({ accessToken, refreshToken }).toEqual({
			accessToken: "new-access-token",
			refreshToken: "new-refresh-token",
		});
	});
});
describe("Redirect URI", async () => {
	it("should infer redirect uri", async () => {
		const { client } = await getTestInstance({
			basePath: "/custom/path",
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});

		await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/callback",
			},
			{
				onSuccess(context) {
					const redirectURI = context.data.url;
					expect(redirectURI).toContain(
						"http%3A%2F%2Flocalhost%3A3000%2Fcustom%2Fpath%2Fcallback%2Fgoogle",
					);
				},
			},
		);
	});

	it("should respect custom redirect uri", async () => {
		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					redirectURI: "https://test.com/callback",
				},
			},
		});

		await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/callback",
			},
			{
				onSuccess(context) {
					const redirectURI = context.data.url;
					expect(redirectURI).toContain(
						"redirect_uri=https%3A%2F%2Ftest.com%2Fcallback",
					);
				},
			},
		);
	});
});

describe("Disable implicit signup", async () => {
	it("Should not create user when implicit sign up is disabled", async () => {
		const { client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					disableImplicitSignUp: true,
				},
			},
		});
		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

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
				expect(location).toContain(
					"http://localhost:3000/api/auth/error?error=signup_disabled",
				);
			},
		});
	});

	it("Should create user when implicit sign up is disabled but it is requested", async () => {
		const { client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					disableImplicitSignUp: true,
				},
			},
		});

		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
			requestSignUp: true,
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

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
				expect(location).toContain("/welcome");
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				expect(cookies.get("better-auth.session_token")?.value).toBeDefined();
			},
		});
	});
});

describe("Disable signup", async () => {
	it("Should not create user when sign up is disabled", async () => {
		const headers = new Headers();
		const { client, cookieSetter } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					disableSignUp: true,
				},
			},
		});

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

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
				expect(location).toContain(
					"http://localhost:3000/api/auth/error?error=signup_disabled",
				);
			},
		});
	});
});

describe("signin", async () => {
	const database = new Database(":memory:");

	beforeAll(async () => {
		const migrations = await getMigrations({
			database,
		});
		await migrations.runMigrations();
	});
	it("should allow user info override during sign in", async () => {
		let state = "";
		const headers = new Headers();
		const { client, cookieSetter } = await getTestInstance({
			database,
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
		});
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
		state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError: (c) => {
				cookieSetter(headers)(c as any);
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user).toMatchObject({
			name: "First Last",
		});
	});

	it("should allow user info override during sign in", async () => {
		shouldUseUpdatedProfile = true;
		const headers = new Headers();
		let state = "";
		const { client, cookieSetter } = await getTestInstance(
			{
				database,
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
						enabled: true,
						overrideUserInfoOnSignIn: true,
					},
				},
			},
			{
				disableTestUser: true,
			},
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
		state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError: (c) => {
				cookieSetter(headers)(c as any);
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user).toMatchObject({
			name: "Updated User",
		});
	});

	it("should allow additional data in oauth state", async () => {
		let additionalData: Record<string, any> | null = null;
		const headers = new Headers();
		let state = "";
		const { client, cookieSetter } = await getTestInstance(
			{
				database,
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
						enabled: true,
						overrideUserInfoOnSignIn: true,
					},
				},
				hooks: {
					after: createAuthMiddleware(async (ctx) => {
						if (ctx.path === "/callback/:id") {
							additionalData = await getOAuthState();
						}
					}),
				},
			},
			{
				disableTestUser: true,
			},
		);
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			additionalData: {
				invitedBy: "user-123",
			},
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError: (c) => {
				cookieSetter(headers)(c as any);
			},
		});
		expect(additionalData).toEqual({
			callbackURL: "/callback",
			codeVerifier: expect.any(String),
			expiresAt: expect.any(Number),
			invitedBy: "user-123",
			errorURL: "http://localhost:3000/api/auth/error",
		});
	});

	it("should not allow overriding oauth code verifier, expiresAt, callbackURL, errorURL, newUserURL, link, requestSignUp", async () => {
		let additionalData: Record<string, any> | null = null;
		const headers = new Headers();
		let state = "";
		const { client, cookieSetter } = await getTestInstance(
			{
				database,
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
						enabled: true,
						overrideUserInfoOnSignIn: true,
					},
				},
				hooks: {
					after: createAuthMiddleware(async (ctx) => {
						if (ctx.path === "/callback/:id") {
							additionalData = await getOAuthState();
						}
					}),
				},
			},
			{
				disableTestUser: true,
			},
		);
		const expiresAt = Date.now();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			additionalData: {
				codeVerifier: "test-code-verifier",
				callbackURL: "test-callback-url",
				errorURL: "test-error-url",
				newUserURL: "test-new-user-url",
				link: {
					email: "test-email",
					userId: "test-user-id",
				},
				requestSignUp: true,
				expiresAt: expiresAt,
			},
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError: (c) => {
				cookieSetter(headers)(c as any);
			},
		});
		expect(additionalData!.codeVerifier).not.toBe("test-code-verifier");
		expect(additionalData!.callbackURL).not.toBe("test-callback-url");
		expect(additionalData!.errorURL).not.toBe("test-error-url");
		expect(additionalData!.newUserURL).not.toBe("test-new-user-url");
		expect(additionalData!.link).not.toBe({
			email: "test-email",
			userId: "test-user-id",
		});
		expect(additionalData!.requestSignUp).not.toBe(true);
		expect(additionalData!.expiresAt).not.toBe(expiresAt);
	});
});

describe("updateAccountOnSignIn", async () => {
	const { client, cookieSetter, auth } = await getTestInstance({
		account: {
			updateAccountOnSignIn: false,
		},
	});
	const ctx = await auth.$context;
	it("should not update account on sign in", async () => {
		const headers = new Headers();
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
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			method: "GET",
			headers,
			onError(context) {
				cookieSetter(headers)(context as any);
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		const userAccounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		await runWithEndpointContext(
			{
				context: ctx,
			} as GenericEndpointContext,
			() =>
				ctx.internalAdapter.updateAccount(userAccounts[0]!.id, {
					accessToken: "new-access-token",
				}),
		);

		//re-sign in
		const signInRes2 = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes2.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state2 =
			new URL(signInRes2.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: {
				state: state2,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				cookieSetter(headers)(context as any);
			},
		});
		const session2 = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		const userAccounts2 = await ctx.internalAdapter.findAccounts(
			session2.data?.user.id!,
		);
		expect(userAccounts2[0]!.accessToken).toBe("new-access-token");
	});
});

describe("Vercel Provider", async () => {
	beforeAll(async () => {
		mswServer.use(
			http.post(
				"https://api.vercel.com/login/oauth/token",
				async ({ request }) => {
					const body = await request.text();
					const params = new URLSearchParams(body);

					// Verify PKCE is present
					const codeVerifier = params.get("code_verifier");
					expect(codeVerifier).not.toBeNull();
					expect(codeVerifier).not.toBe("");

					const profile: VercelProfile = {
						sub: "vercel_user_123",
						email: "vercel@test.com",
						email_verified: true,
						name: "Vercel User",
						preferred_username: "verceluser",
						picture: "https://vercel.com/avatar.png",
					};

					const idToken = await signJWT(profile, DEFAULT_SECRET);
					return HttpResponse.json({
						access_token: "vercel_access_token",
						refresh_token: "vercel_refresh_token",
						id_token: idToken,
						token_type: "Bearer",
						expires_in: 3600,
					});
				},
			),
			http.get("https://api.vercel.com/login/oauth/userinfo", async () => {
				return HttpResponse.json({
					sub: "vercel_user_123",
					email: "vercel@test.com",
					email_verified: true,
					name: "Vercel User",
					preferred_username: "verceluser",
					picture: "https://vercel.com/avatar.png",
				});
			}),
		);
	});

	it("should configure Vercel provider correctly", async () => {
		const { auth } = await getTestInstance({
			socialProviders: {
				vercel: {
					clientId: "vercel-test-client-id",
					clientSecret: "vercel-test-client-secret",
				},
			},
		});

		const ctx = await auth.$context;
		const vercelProvider = ctx.socialProviders.find((p) => p.id === "vercel");

		expect(vercelProvider).toBeDefined();
		expect(vercelProvider?.id).toBe("vercel");
		expect(vercelProvider?.name).toBe("Vercel");
	});

	it("should initiate Vercel OAuth flow with PKCE", async () => {
		const { client } = await getTestInstance({
			socialProviders: {
				vercel: {
					clientId: "vercel-test-client-id",
					clientSecret: "vercel-test-client-secret",
				},
			},
		});

		const signInRes = await client.signIn.social({
			provider: "vercel",
			callbackURL: "/dashboard",
		});

		expect(signInRes.data).toBeDefined();
		expect(signInRes.data?.url).toContain("vercel.com/oauth/authorize");
		expect(signInRes.data?.redirect).toBe(true);

		// Verify PKCE parameters are present
		const authUrl = new URL(signInRes.data!.url!);
		expect(authUrl.searchParams.get("code_challenge")).not.toBeNull();
		expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
	});

	it("should complete Vercel OAuth flow and create user", async () => {
		const { client, cookieSetter, auth } = await getTestInstance(
			{
				socialProviders: {
					vercel: {
						clientId: "vercel-test-client-id",
						clientSecret: "vercel-test-client-secret",
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "vercel",
			callbackURL: "/dashboard",
			newUserCallbackURL: "/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toBeDefined();
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/vercel", {
			query: {
				state,
				code: "vercel_test_code",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain("/welcome");

				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				expect(cookies.get("better-auth.session_token")?.value).toBeDefined();

				cookieSetter(headers)(context as any);
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		expect(session.data).toBeDefined();
		expect(session.data?.user.email).toBe("vercel@test.com");
		expect(session.data?.user.name).toBe("Vercel User");
		expect(session.data?.user.image).toBe("https://vercel.com/avatar.png");
		expect(session.data?.user.emailVerified).toBe(true);

		// Verify account was created
		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.providerId).toBe("vercel");
		expect(accounts[0]?.accountId).toBe("vercel_user_123");
	});

	it("should use preferred_username as fallback for name", async () => {
		mswServer.use(
			http.post("https://api.vercel.com/login/oauth/token", async () => {
				const profile: VercelProfile = {
					sub: "vercel_user_456",
					email: "noname@vercel.com",
					email_verified: true,
					preferred_username: "cooldev",
					// No name field
					picture: "https://vercel.com/avatar2.png",
				};

				const idToken = await signJWT(profile, DEFAULT_SECRET);
				return HttpResponse.json({
					access_token: "vercel_access_token_2",
					id_token: idToken,
					token_type: "Bearer",
					expires_in: 3600,
				});
			}),
			http.get("https://api.vercel.com/login/oauth/userinfo", async () => {
				return HttpResponse.json({
					sub: "vercel_user_456",
					email: "noname@vercel.com",
					email_verified: true,
					preferred_username: "cooldev",
					picture: "https://vercel.com/avatar2.png",
				});
			}),
		);

		const { client, cookieSetter } = await getTestInstance(
			{
				socialProviders: {
					vercel: {
						clientId: "vercel-test-client-id",
						clientSecret: "vercel-test-client-secret",
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "vercel",
			callbackURL: "/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/vercel", {
			query: { state, code: "vercel_test_code_2" },
			headers,
			method: "GET",
			onError(context) {
				cookieSetter(headers)(context as any);
			},
		});

		const session = await client.getSession({
			fetchOptions: { headers },
		});

		expect(session.data?.user.name).toBe("cooldev");
	});

	it("should allow additional scopes", async () => {
		const { client } = await getTestInstance({
			socialProviders: {
				vercel: {
					clientId: "vercel-test-client-id",
					clientSecret: "vercel-test-client-secret",
					scope: ["openid", "email", "profile", "offline_access"],
				},
			},
		});

		const signInRes = await client.signIn.social({
			provider: "vercel",
			callbackURL: "/dashboard",
		});

		expect(signInRes.data?.url).toBeDefined();
		const authUrl = new URL(signInRes.data!.url!);
		const scopes = authUrl.searchParams.get("scope");

		expect(scopes).toContain("openid");
		expect(scopes).toContain("email");
		expect(scopes).toContain("profile");
		expect(scopes).toContain("offline_access");
	});

	it("should support mapProfileToUser", async () => {
		const { client, cookieSetter } = await getTestInstance(
			{
				user: {
					additionalFields: {
						vercelUserId: {
							type: "string",
						},
					},
				},
				socialProviders: {
					vercel: {
						clientId: "vercel-test-client-id",
						clientSecret: "vercel-test-client-secret",
						mapProfileToUser(profile: VercelProfile) {
							return {
								vercelUserId: profile.sub,
							};
						},
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		const headers = new Headers();
		const signInRes = await client.signIn.social({
			provider: "vercel",
			callbackURL: "/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/vercel", {
			query: { state, code: "vercel_test_code_3" },
			headers,
			method: "GET",
			onError(context) {
				cookieSetter(headers)(context as any);
			},
		});

		const session = await client.getSession({
			fetchOptions: { headers },
		});

		expect(session.data?.user).toHaveProperty("vercelUserId");
		// The test uses the mocked userinfo which returns vercel_user_123 at this point
		expect((session.data?.user as any).vercelUserId).toBeDefined();
	});

	it("should redirect existing Vercel users to callback URL", async () => {
		const { client, cookieSetter } = await getTestInstance({
			socialProviders: {
				vercel: {
					clientId: "vercel-test-client-id",
					clientSecret: "vercel-test-client-secret",
				},
			},
		});

		const headers = new Headers();

		// First sign-in (new user)
		const signInRes1 = await client.signIn.social({
			provider: "vercel",
			callbackURL: "/dashboard",
			newUserCallbackURL: "/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const state1 =
			new URL(signInRes1.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/vercel", {
			query: { state: state1, code: "vercel_test_code_existing" },
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.headers.get("location")).toContain("/welcome");
				cookieSetter(headers)(context as any);
			},
		});

		// Second sign-in (existing user)
		const signInRes2 = await client.signIn.social({
			provider: "vercel",
			callbackURL: "/dashboard",
			newUserCallbackURL: "/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		const state2 =
			new URL(signInRes2.data!.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/vercel", {
			query: { state: state2, code: "vercel_test_code_existing_2" },
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toContain("/dashboard");
				expect(location).not.toContain("/welcome");
			},
		});
	});
});
