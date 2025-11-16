import type { GenericEndpointContext } from "@better-auth/core";
import { runWithEndpointContext } from "@better-auth/core/context";
import { betterFetch } from "@better-fetch/fetch";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from ".";
import { genericOAuthClient } from "./client";

describe("oauth2", async () => {
	const providerId = "test";
	const clientId = "test-client-id";
	const clientSecret = "test-client-secret";
	const server = new OAuth2Server();
	await server.start();
	const port = Number(server.issuer.url?.split(":")[2]!);

	afterAll(async () => {
		await server.stop();
	});

	const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
		plugins: [
			genericOAuth({
				config: [
					{
						providerId,
						discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
						clientId: clientId,
						clientSecret: clientSecret,
						pkce: true,
					},
				],
			}),
		],
	});

	const authClient = createAuthClient({
		plugins: [genericOAuthClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	beforeAll(async () => {
		const context = await auth.$context;
		await runWithEndpointContext(
			{
				context,
			} as GenericEndpointContext,
			async () => {
				await context.internalAdapter.createUser({
					email: "oauth2@test.com",
					name: "OAuth2 Test",
				});
			},
		);
		await server.issuer.keys.generate("RS256");
	});

	server.service.on("beforeUserinfo", (userInfoResponse, req) => {
		userInfoResponse.body = {
			email: "oauth2@test.com",
			name: "OAuth2 Test",
			sub: "oauth2",
			picture: "https://test.com/picture.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	async function simulateOAuthFlow(
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

		let callbackURL = "";
		const newHeaders = new Headers();
		await betterFetch(location, {
			method: "GET",
			customFetchImpl: fetchImpl || customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				cookieSetter(newHeaders)(context);
			},
		});

		return { callbackURL, headers: newHeaders };
	}

	it("should redirect to the provider and handle the response", async () => {
		let headers = new Headers();
		const signInRes = await authClient.signIn.oauth2({
			providerId: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining(`http://localhost:${port}/authorize`),
			redirect: true,
		});
		const { callbackURL } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
		);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	it("should redirect to the provider and handle the response for a new user", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2-2@test.com",
				name: "OAuth2 Test 2",
				sub: "oauth2-2",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		let headers = new Headers();
		const signInRes = await authClient.signIn.oauth2({
			providerId: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining(`http://localhost:${port}/authorize`),
			redirect: true,
		});
		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
		);
		expect(callbackURL).toBe("http://localhost:3000/new_user");
		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);
		const account = accounts[0];
		expect(account).toMatchObject({
			providerId,
			accountId: "oauth2-2",
			userId: session.data?.user.id,
			accessToken: expect.any(String),
			refreshToken: expect.any(String),
			accessTokenExpiresAt: expect.any(Date),
			refreshTokenExpiresAt: null,
			scope: expect.any(String),
			idToken: expect.any(String),
		});
	});

	it("should redirect to the provider and handle the response after linked", async () => {
		let headers = new Headers();
		const res = await authClient.signIn.oauth2({
			providerId: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
		);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	it("should handle invalid provider ID", async () => {
		const res = await authClient.signIn.oauth2({
			providerId: "invalid-provider",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});
		expect(res.error?.status).toBe(400);
	});

	it("should handle server error during OAuth flow", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2@test.com",
				name: "OAuth2 Test",
				sub: "oauth2",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 500;
		});

		let headers = new Headers();
		const res = await authClient.signIn.oauth2(
			{
				providerId: "test",
				callbackURL: "http://localhost:3000/dashboard",
				newUserCallbackURL: "http://localhost:3000/new_user",
			},
			{
				onSuccess(context) {
					const parsedSetCookie = parseSetCookieHeader(
						context.response.headers.get("Set-Cookie") || "",
					);
					headers.set(
						"cookie",
						`better-auth.state=${
							parsedSetCookie.get("better-auth.state")?.value
						}; better-auth.pk_code_verifier=${
							parsedSetCookie.get("better-auth.pk_code_verifier")?.value
						}`,
					);
				},
			},
		);

		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
		);
		expect(callbackURL).toContain("?error=");
	});

	it("should work with custom redirect uri", async () => {
		const { customFetchImpl, auth } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test2",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							redirectURI: "http://localhost:3000/api/auth/callback/test2",
							pkce: true,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const res = await authClient.signIn.oauth2({
			providerId: "test2",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toBe("http://localhost:3000/new_user");
	});

	it("should not create user when sign ups are disabled", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2-signup-disabled@test.com",
				name: "OAuth2 Test Signup Disabled",
				sub: "oauth2-signup-disabled",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test2",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							disableImplicitSignUp: true,
						},
					],
				}),
			],
		});
		const authClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const headers = new Headers();
		const res = await authClient.signIn.oauth2({
			providerId: "test2",
			callbackURL: "http://localhost:3000/dashboard",
			errorCallbackURL: "http://localhost:3000/error",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toBe(
			"http://localhost:3000/error?error=signup_disabled",
		);
	});

	it("should create user when sign ups are disabled and sign up is requested", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2-signup-disabled-and-requested@test.com",
				name: "OAuth2 Test Signup Disabled And Requested",
				sub: "oauth2-signup-disabled-and-requested",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test2",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							disableImplicitSignUp: true,
						},
					],
				}),
			],
		});

		const authClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const headers = new Headers();
		const res = await authClient.signIn.oauth2({
			providerId: "test2",
			callbackURL: "http://localhost:3000/dashboard",
			errorCallbackURL: "http://localhost:3000/error",
			requestSignUp: true,
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});

	it("should pass authorization headers in oAuth2Callback", async () => {
		const customHeaders = {
			"X-Custom-Header": "test-value",
		};

		let receivedHeaders: Record<string, string> = {};
		server.service.once("beforeTokenSigning", (token, req) => {
			receivedHeaders = req.headers as Record<string, string>;
		});

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test3",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							authorizationHeaders: customHeaders,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const res = await authClient.signIn.oauth2({
			providerId: "test3",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		await simulateOAuthFlow(res.data?.url || "", headers, customFetchImpl);

		expect(receivedHeaders).toHaveProperty("x-custom-header");
		expect(receivedHeaders["x-custom-header"]).toBe("test-value");
	});

	it("should delete oauth user with verification flow without password", async () => {
		let token = "";
		const { customFetchImpl, cookieSetter } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
					async sendDeleteAccountVerification(data, _) {
						token = data.token;
					},
				},
			},
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});
		const signInRes = await client.signIn.oauth2({
			providerId: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining(`http://localhost:${port}/authorize`),
			redirect: true,
		});

		const { headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		const session = await client.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(session.data).not.toBeNull();

		const deleteRes = await client.deleteUser({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(deleteRes.data).toMatchObject({
			success: true,
		});

		expect(token.length).toBe(32);

		const deleteCallbackRes = await client.deleteUser({
			token,
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(deleteCallbackRes.data).toMatchObject({
			success: true,
		});
		const nullSession = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(nullSession.data).toBeNull();
	});

	it("should handle numeric account IDs correctly and prevent duplicate accounts", async () => {
		const numericAccountId = 123456789;
		const userEmail = "numeric-id-test@test.com";

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: userEmail,
				name: "Numeric ID Test User",
				sub: numericAccountId,
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "numeric-test",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const firstSignIn = await authClient.signIn.oauth2({
			providerId: "numeric-test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL: firstCallbackURL, headers: firstHeaders } =
			await simulateOAuthFlow(
				firstSignIn.data?.url || "",
				headers,
				customFetchImpl,
			);

		expect(firstCallbackURL).toBe("http://localhost:3000/new_user");

		const firstSession = await authClient.getSession({
			fetchOptions: {
				headers: firstHeaders,
			},
		});

		expect(firstSession.data).not.toBeNull();
		const userId = firstSession.data?.user.id!;

		const ctx = await auth.$context;
		const accountsAfterFirst = await ctx.internalAdapter.findAccounts(userId);
		expect(accountsAfterFirst).toHaveLength(1);
		expect(accountsAfterFirst[0]).toMatchObject({
			providerId: "numeric-test",
			accountId: String(numericAccountId),
			userId: userId,
		});

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: userEmail,
				name: "Numeric ID Test User",
				sub: numericAccountId,
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const secondSignIn = await authClient.signIn.oauth2({
			providerId: "numeric-test",
			callbackURL: "http://localhost:3000/dashboard",
		});

		const { callbackURL: secondCallbackURL, headers: secondHeaders } =
			await simulateOAuthFlow(
				secondSignIn.data?.url || "",
				headers,
				customFetchImpl,
			);

		expect(secondCallbackURL).toBe("http://localhost:3000/dashboard");

		const secondSession = await authClient.getSession({
			fetchOptions: {
				headers: secondHeaders,
			},
		});

		expect(secondSession.data).not.toBeNull();
		expect(secondSession.data?.user.id).toBe(userId);

		const accountsAfterSecond = await ctx.internalAdapter.findAccounts(userId);
		expect(accountsAfterSecond).toHaveLength(1);
		expect(accountsAfterSecond[0]!.accountId).toBe(String(numericAccountId));
	});

	it("should handle custom getUserInfo returning numeric ID", async () => {
		const numericId = 987654321;

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "custom-numeric",
							authorizationUrl: `http://localhost:${port}/authorize`,
							tokenUrl: `http://localhost:${port}/token`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							getUserInfo: async (_tokens) => {
								return {
									id: numericId,
									email: "custom-numeric@test.com",
									name: "Custom Numeric User",
									emailVerified: true,
									image: "https://test.com/avatar.png",
								};
							},
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.oauth2({
			providerId: "custom-numeric",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);

		expect(accounts[0]!.accountId).toBe(String(numericId));
	});

	it("should handle mapProfileToUser returning numeric ID", async () => {
		const numericProfileId = 111222333;

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "map-profile-numeric@test.com",
				name: "Map Profile Numeric User",
				sub: "string-sub-id",
				user_id: numericProfileId,
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "map-profile-numeric",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							mapProfileToUser: (profile) => {
								return {
									id: profile.user_id,
									email: profile.email,
									name: profile.name,
									emailVerified: profile.email_verified,
								};
							},
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.oauth2({
			providerId: "map-profile-numeric",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);

		expect(accounts[0]!.accountId).toBe(String(numericProfileId));
	});

	it("should handle Strava OAuth with custom mapProfileToUser", async () => {
		const stravaUserId = 12345678;
		const stravaProfile = {
			id: stravaUserId,
			firstname: "John",
			lastname: "Doe",
			profile: "https://example.com/strava-avatar.jpg",
			email_verified: true,
		};

		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = stravaProfile;
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "strava",
							authorizationUrl: `http://localhost:${port}/authorize`,
							tokenUrl: `http://localhost:${port}/token`,
							userInfoUrl: `http://localhost:${port}/userinfo`,
							clientId: "STRAVA_CLIENT_ID",
							clientSecret: "STRAVA_CLIENT_SECRET",
							scopes: ["read", "activity:read_all"],
							pkce: true,
							mapProfileToUser: (profile) => {
								const fullName = `${profile.firstname} ${profile.lastname}`;
								return {
									id: profile.id,
									email: `${profile.id}@strava.local`,
									name: fullName,
									image: profile.profile,
									emailVerified: true,
								};
							},
						},
					],
				}),
			],
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const signInRes = await authClient.signIn.oauth2({
			providerId: "strava",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		expect(signInRes.data?.url).toContain(`http://localhost:${port}/authorize`);
		// we missed the `activity:read_all`
		expect(signInRes.data?.url).toContain("scope=read+activity");

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe(`${stravaUserId}@strava.local`);
		expect(session.data?.user.name).toBe("John Doe");
		expect(session.data?.user.image).toBe(
			"https://example.com/strava-avatar.jpg",
		);

		const ctx = await auth.$context;
		const accounts = await ctx.internalAdapter.findAccounts(
			session.data?.user.id!,
		);

		expect(accounts[0]).toMatchObject({
			providerId: "strava",
			accountId: String(stravaUserId),
			userId: session.data?.user.id,
		});
	});

	it("should work with cookie-based state storage", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "oauth2-cookie-state@test.com",
				name: "OAuth2 Cookie State",
				sub: "oauth2-cookie-state",
				picture: "https://test.com/picture.png",
				email_verified: true,
			};
			userInfoResponse.statusCode = 200;
		});

		const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test-cookie",
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
						},
					],
				}),
			],
			advanced: {
				oauthConfig: {
					storeStateStrategy: "cookie",
				},
			},
		});
		const headers = new Headers();
		const authClient = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				onSuccess: cookieSetter(headers),
			},
		});

		const res = await authClient.signIn.oauth2({
			providerId: "test-cookie",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);

		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toBe("http://localhost:3000/new_user");

		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.email).toBe("oauth2-cookie-state@test.com");
		expect(session.data?.user.name).toBe("OAuth2 Cookie State");
	});

	it("should await async mapProfileToUser", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test-async",
							clientId: clientId,
							clientSecret: clientSecret,
							getUserInfo: async (_tokens) => ({
								id: "test-user-id",
								email: "test@example.com",
								name: "Test User",
								emailVerified: true,
							}),
							mapProfileToUser: async (
								_profile,
							): Promise<Record<string, any>> => {
								return { customField: "async-custom-data" };
							},
						},
					],
				}),
			],
		});

		const context = await auth.$context;
		const provider = context.socialProviders.find((p) => p.id === "test-async");

		const result = await provider!.getUserInfo({
			accessToken: "test-access-token",
			idToken: undefined,
			refreshToken: undefined,
		});

		expect(result?.user).toHaveProperty("customField", "async-custom-data");
	});
});
