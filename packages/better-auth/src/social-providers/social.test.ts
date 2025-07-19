import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { DEFAULT_SECRET } from "../utils/constants";
import type { GoogleProfile } from "./google";
import { parseSetCookieHeader } from "../cookies";
import { getOAuth2Tokens, refreshAccessToken } from "../oauth2";
import { signJWT } from "../crypto/jwt";
import { OAuth2Server } from "oauth2-mock-server";
import { betterFetch } from "@better-fetch/fetch";
import Database from "better-sqlite3";
import { getMigrations } from "../db";

let server = new OAuth2Server();

vi.mock("../oauth2", async (importOriginal) => {
	const original = (await importOriginal()) as any;
	return {
		...original,
		validateAuthorizationCode: vi
			.fn()
			.mockImplementation(async (option: any) => {
				if (option.options.overrideUserInfoOnSignIn) {
					const data: GoogleProfile = {
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
					};
					const testIdToken = await signJWT(data, DEFAULT_SECRET);
					const tokens = getOAuth2Tokens({
						access_token: "test",
						refresh_token: "test",
						id_token: testIdToken,
					});
					return tokens;
				}
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
				const tokens = getOAuth2Tokens({
					access_token: "test",
					refresh_token: "test",
					id_token: testIdToken,
				});
				return tokens;
			}),
		refreshAccessToken: vi.fn().mockImplementation(async (args) => {
			const { refreshToken, options, tokenEndpoint } = args;
			expect(refreshToken).toBeDefined();
			expect(options.clientId).toBe("test-client-id");
			expect(options.clientSecret).toBe("test-client-secret");
			expect(tokenEndpoint).toBe("http://localhost:8080/token");

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
			const tokens = getOAuth2Tokens({
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				id_token: testIdToken,
				token_type: "Bearer",
				expires_in: 3600, // Token expires in 1 hour
			});
			return tokens;
		}),
	};
});

describe("Social Providers", async (c) => {
	const { auth, customFetchImpl, client, cookieSetter } = await getTestInstance(
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
		await server.start(8080, "localhost");
		console.log("Issuer URL:", server.issuer.url); // -> http://localhost:8080
	});
	afterAll(async () => {
		await server.stop().catch(console.error);
	});
	server.service.on("beforeRsponse", (tokenResponse, req) => {
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
	let state = "";

	const headers = new Headers();
	describe("signin", async () => {
		async function simulateOAuthFlowRefresh(
			authUrl: string,
			headers: Headers,
			fetchImpl?: (...args: any) => any,
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
				tokenEndpoint: "http://localhost:8080/token",
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
			state = new URL(signInRes.data!.url!).searchParams.get("state") || "";
		});

		it("should be able to sign in with social providers", async () => {
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
					expect(location).toContain("/welcome");
					const cookies = parseSetCookieHeader(
						context.response.headers.get("set-cookie") || "",
					);
					expect(cookies.get("better-auth.session_token")?.value).toBeDefined();
				},
			});
		});

		it("Should use callback URL if the user is already registered", async () => {
			const signInRes = await client.signIn.social({
				provider: "google",
				callbackURL: "/callback",
				newUserCallbackURL: "/welcome",
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
			const signInRes = await client.signIn.social({
				provider: "google",
				callbackURL: "/callback",
			});
			expect(signInRes.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

			const headers = new Headers();

			const profile = await client.$fetch("/callback/google", {
				query: {
					state,
					code: "test",
				},
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
			const signInRes = await client.signIn.social({
				provider: "google",
				callbackURL: "/callback",
				newUserCallbackURL: "/welcome",
			});
			const headers = new Headers();
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
				"http://localhost:8080/authorize",
			);
			const result = await simulateOAuthFlowRefresh(mockEndpoint, headers);
			const { accessToken, refreshToken } = result;
			expect({ accessToken, refreshToken }).toEqual({
				accessToken: "new-access-token",
				refreshToken: "new-refresh-token",
			});
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
		const { auth, customFetchImpl, client } = await getTestInstance({
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
		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					disableImplicitSignUp: true,
				},
			},
		});

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
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
		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					disableImplicitSignUp: true,
				},
			},
		});

		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			newUserCallbackURL: "/welcome",
			requestSignUp: true,
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
		const { client } = await getTestInstance({
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
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		const headers = new Headers();

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
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
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		const headers = new Headers();

		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
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
		await ctx.internalAdapter.updateAccount(userAccounts[0].id, {
			accessToken: "new-access-token",
		});

		//re-sign in
		const signInRes2 = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
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
		expect(userAccounts2[0].accessToken).toBe("new-access-token");
	});
});
