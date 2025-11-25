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
import { auth0 } from "./providers/auth0";
import { keycloak } from "./providers/keycloak";
import { microsoftEntraId } from "./providers/microsoft-entra-id";
import { okta } from "./providers/okta";
import { slack } from "./providers/slack";

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
			account: {
				storeStateStrategy: "cookie",
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

	describe("Okta Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const oktaConfig = okta({
				clientId: "okta-client-id",
				clientSecret: "okta-client-secret",
				issuer: "https://dev-12345.okta.com/oauth2/default",
			});

			expect(oktaConfig.providerId).toBe("okta");
			expect(oktaConfig.discoveryUrl).toBe(
				"https://dev-12345.okta.com/oauth2/default/.well-known/openid-configuration",
			);
			expect(oktaConfig.scopes).toEqual(["openid", "profile", "email"]);
			expect(oktaConfig.clientId).toBe("okta-client-id");
			expect(oktaConfig.clientSecret).toBe("okta-client-secret");
			expect(oktaConfig.getUserInfo).toBeDefined();
			expect(typeof oktaConfig.getUserInfo).toBe("function");
		});

		it("should handle issuer with trailing slash", () => {
			const oktaConfig = okta({
				clientId: "okta-client-id",
				clientSecret: "okta-client-secret",
				issuer: "https://dev-12345.okta.com/oauth2/default/",
			});

			expect(oktaConfig.discoveryUrl).toBe(
				"https://dev-12345.okta.com/oauth2/default/.well-known/openid-configuration",
			);
		});

		it("should allow overriding scopes", () => {
			const oktaConfig = okta({
				clientId: "okta-client-id",
				clientSecret: "okta-client-secret",
				issuer: "https://dev-12345.okta.com/oauth2/default",
				scopes: ["openid", "profile"],
			});

			expect(oktaConfig.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const oktaConfig = okta({
				clientId: "okta-client-id",
				clientSecret: "okta-client-secret",
				issuer: "https://dev-12345.okta.com/oauth2/default",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(oktaConfig.pkce).toBe(true);
			expect(oktaConfig.disableImplicitSignUp).toBe(true);
		});
	});

	describe("Auth0 Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const auth0Config = auth0({
				clientId: "auth0-client-id",
				clientSecret: "auth0-client-secret",
				domain: "dev-xxx.eu.auth0.com",
			});

			expect(auth0Config.providerId).toBe("auth0");
			expect(auth0Config.discoveryUrl).toBe(
				"https://dev-xxx.eu.auth0.com/.well-known/openid-configuration",
			);
			expect(auth0Config.scopes).toEqual(["openid", "profile", "email"]);
			expect(auth0Config.clientId).toBe("auth0-client-id");
			expect(auth0Config.clientSecret).toBe("auth0-client-secret");
			expect(auth0Config.getUserInfo).toBeDefined();
			expect(typeof auth0Config.getUserInfo).toBe("function");
		});

		it("should handle domain with protocol prefix", () => {
			const auth0Config = auth0({
				clientId: "auth0-client-id",
				clientSecret: "auth0-client-secret",
				domain: "https://dev-xxx.eu.auth0.com",
			});

			expect(auth0Config.discoveryUrl).toBe(
				"https://dev-xxx.eu.auth0.com/.well-known/openid-configuration",
			);
		});

		it("should allow overriding scopes", () => {
			const auth0Config = auth0({
				clientId: "auth0-client-id",
				clientSecret: "auth0-client-secret",
				domain: "dev-xxx.eu.auth0.com",
				scopes: ["openid", "profile"],
			});

			expect(auth0Config.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const auth0Config = auth0({
				clientId: "auth0-client-id",
				clientSecret: "auth0-client-secret",
				domain: "dev-xxx.eu.auth0.com",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(auth0Config.pkce).toBe(true);
			expect(auth0Config.disableImplicitSignUp).toBe(true);
		});
	});

	describe("Microsoft Entra ID Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const msConfig = microsoftEntraId({
				clientId: "ms-client-id",
				clientSecret: "ms-client-secret",
				tenantId: "common",
			});

			expect(msConfig.providerId).toBe("microsoft-entra-id");
			expect(msConfig.authorizationUrl).toBe(
				"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			);
			expect(msConfig.tokenUrl).toBe(
				"https://login.microsoftonline.com/common/oauth2/v2.0/token",
			);
			expect(msConfig.userInfoUrl).toBe(
				"https://graph.microsoft.com/oidc/userinfo",
			);
			expect(msConfig.scopes).toEqual(["openid", "profile", "email"]);
			expect(msConfig.clientId).toBe("ms-client-id");
			expect(msConfig.clientSecret).toBe("ms-client-secret");
			expect(msConfig.getUserInfo).toBeDefined();
			expect(typeof msConfig.getUserInfo).toBe("function");
		});

		it("should handle tenant ID as GUID", () => {
			const tenantId = "12345678-1234-1234-1234-123456789012";
			const msConfig = microsoftEntraId({
				clientId: "ms-client-id",
				clientSecret: "ms-client-secret",
				tenantId,
			});

			expect(msConfig.authorizationUrl).toBe(
				`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
			);
		});

		it("should allow overriding scopes", () => {
			const msConfig = microsoftEntraId({
				clientId: "ms-client-id",
				clientSecret: "ms-client-secret",
				tenantId: "common",
				scopes: ["openid", "profile"],
			});

			expect(msConfig.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const msConfig = microsoftEntraId({
				clientId: "ms-client-id",
				clientSecret: "ms-client-secret",
				tenantId: "common",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(msConfig.pkce).toBe(true);
			expect(msConfig.disableImplicitSignUp).toBe(true);
		});
	});

	describe("Slack Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const slackConfig = slack({
				clientId: "slack-client-id",
				clientSecret: "slack-client-secret",
			});

			expect(slackConfig.providerId).toBe("slack");
			expect(slackConfig.authorizationUrl).toBe(
				"https://slack.com/openid/connect/authorize",
			);
			expect(slackConfig.tokenUrl).toBe(
				"https://slack.com/api/openid.connect.token",
			);
			expect(slackConfig.userInfoUrl).toBe(
				"https://slack.com/api/openid.connect.userInfo",
			);
			expect(slackConfig.scopes).toEqual(["openid", "profile", "email"]);
			expect(slackConfig.clientId).toBe("slack-client-id");
			expect(slackConfig.clientSecret).toBe("slack-client-secret");
			expect(slackConfig.getUserInfo).toBeDefined();
			expect(typeof slackConfig.getUserInfo).toBe("function");
		});

		it("should allow overriding scopes", () => {
			const slackConfig = slack({
				clientId: "slack-client-id",
				clientSecret: "slack-client-secret",
				scopes: ["openid", "profile"],
			});

			expect(slackConfig.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const slackConfig = slack({
				clientId: "slack-client-id",
				clientSecret: "slack-client-secret",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(slackConfig.pkce).toBe(true);
			expect(slackConfig.disableImplicitSignUp).toBe(true);
		});
	});

	describe("Keycloak Provider Helper", () => {
		it("should return correct GenericOAuthConfig", () => {
			const keycloakConfig = keycloak({
				clientId: "keycloak-client-id",
				clientSecret: "keycloak-client-secret",
				issuer: "https://my-domain.com/realms/MyRealm",
			});

			expect(keycloakConfig.providerId).toBe("keycloak");
			expect(keycloakConfig.discoveryUrl).toBe(
				"https://my-domain.com/realms/MyRealm/.well-known/openid-configuration",
			);
			expect(keycloakConfig.scopes).toEqual(["openid", "profile", "email"]);
			expect(keycloakConfig.clientId).toBe("keycloak-client-id");
			expect(keycloakConfig.clientSecret).toBe("keycloak-client-secret");
			expect(keycloakConfig.getUserInfo).toBeDefined();
			expect(typeof keycloakConfig.getUserInfo).toBe("function");
		});

		it("should handle issuer with trailing slash", () => {
			const keycloakConfig = keycloak({
				clientId: "keycloak-client-id",
				clientSecret: "keycloak-client-secret",
				issuer: "https://my-domain.com/realms/MyRealm/",
			});

			expect(keycloakConfig.discoveryUrl).toBe(
				"https://my-domain.com/realms/MyRealm/.well-known/openid-configuration",
			);
		});

		it("should allow overriding scopes", () => {
			const keycloakConfig = keycloak({
				clientId: "keycloak-client-id",
				clientSecret: "keycloak-client-secret",
				issuer: "https://my-domain.com/realms/MyRealm",
				scopes: ["openid", "profile"],
			});

			expect(keycloakConfig.scopes).toEqual(["openid", "profile"]);
		});

		it("should allow overriding other options", () => {
			const keycloakConfig = keycloak({
				clientId: "keycloak-client-id",
				clientSecret: "keycloak-client-secret",
				issuer: "https://my-domain.com/realms/MyRealm",
				pkce: true,
				disableImplicitSignUp: true,
			});

			expect(keycloakConfig.pkce).toBe(true);
			expect(keycloakConfig.disableImplicitSignUp).toBe(true);
		});
	});

	it("should integrate okta provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						okta({
							clientId: "okta-client-id",
							clientSecret: "okta-client-secret",
							issuer: "https://dev-12345.okta.com/oauth2/default",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should integrate auth0 provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						auth0({
							clientId: "auth0-client-id",
							clientSecret: "auth0-client-secret",
							domain: "dev-xxx.eu.auth0.com",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should integrate microsoftEntraId provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						microsoftEntraId({
							clientId: "ms-client-id",
							clientSecret: "ms-client-secret",
							tenantId: "common",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should integrate slack provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						slack({
							clientId: "slack-client-id",
							clientSecret: "slack-client-secret",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should integrate keycloak provider helper with genericOAuth", async () => {
		const { auth: testAuth } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						keycloak({
							clientId: "keycloak-client-id",
							clientSecret: "keycloak-client-secret",
							issuer: "https://my-domain.com/realms/MyRealm",
						}),
					],
				}),
			],
		});

		expect(testAuth).toBeDefined();
	});

	it("should support custom getToken for non-standard providers", async () => {
		const mockTokenResponse = {
			access_token: "custom-access-token",
			refresh_token: "custom-refresh-token",
			expires_in: 3600,
			openid: "custom-openid-123",
			unionid: "custom-unionid-456",
			scope: "snsapi_login",
		};

		let getTokenCalled = false;
		let capturedCode = "";

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "custom-provider",
							clientId: clientId,
							clientSecret: clientSecret,
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							scopes: ["snsapi_login"],
							pkce: true,
							// Custom token exchange that doesn't use standard OAuth flow
							getToken: async ({ code }) => {
								getTokenCalled = true;
								capturedCode = code;

								// Simulate a GET-based token endpoint
								// For testing, we directly return the mock response
								return {
									accessToken: mockTokenResponse.access_token,
									refreshToken: mockTokenResponse.refresh_token,
									accessTokenExpiresAt: new Date(
										Date.now() + mockTokenResponse.expires_in * 1000,
									),
									scopes: mockTokenResponse.scope.split(","),
									raw: mockTokenResponse,
								};
							},
							getUserInfo: async (tokens) => {
								// Access custom fields from raw token data
								const openid = tokens.raw?.openid as string;
								const unionid = tokens.raw?.unionid as string;

								expect(openid).toBe("custom-openid-123");
								expect(unionid).toBe("custom-unionid-456");

								return {
									id: unionid || openid,
									name: "Custom Provider User",
									email: "custom@test.com",
									emailVerified: true,
								};
							},
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
			providerId: "custom-provider",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);

		// Complete the OAuth flow
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);

		// Verify custom getToken was called
		expect(getTokenCalled).toBe(true);
		expect(capturedCode).toBeTruthy();
		expect(callbackURL).toBe("http://localhost:3000/new_user");
	});

	// Note: raw token data preservation is already tested in the other custom getToken tests above
	// This test is redundant as the GET-based and custom provider tests verify raw data preservation

	it("should handle errors in custom getToken", async () => {
		server.service.once("beforeUserinfo", (userInfoResponse) => {
			userInfoResponse.body = {
				email: "error-test@test.com",
				name: "Error Test User",
				sub: "error-test",
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
							providerId: "error-provider",
							clientId: clientId,
							clientSecret: clientSecret,
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							pkce: true,
							getToken: async () => {
								// Simulate token exchange failure
								throw new Error("Token exchange failed");
							},
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
			providerId: "error-provider",
			callbackURL: "http://localhost:3000/dashboard",
			errorCallbackURL: "http://localhost:3000/error",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);

		// Attempt to complete the OAuth flow - should redirect to error URL
		const { callbackURL } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);

		expect(callbackURL).toContain("http://localhost:3000/error");
		expect(callbackURL).toContain("error=");
	});

	it("should support GET-based token endpoints for non-standard providers", async () => {
		const customMockResponse = {
			access_token: "custom-access-token-xyz",
			refresh_token: "custom-refresh-token-xyz",
			expires_in: 7200,
			user_id: "user_12345",
			custom_field: "custom_value",
			scope: "profile email",
		};

		const customUserInfo = {
			display_name: "Test User",
			avatar_url: "https://example.com/avatar.png",
			custom_field: "custom_value",
		};

		let tokenRequestMethod = "";
		let userInfoTokenUsed = "";

		const { customFetchImpl, cookieSetter } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "custom-get-provider",
							clientId: clientId,
							clientSecret: clientSecret,
							discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
							scopes: ["profile", "email"],
							pkce: true,
							// Simulates providers that use GET request with query params instead of POST
							getToken: async () => {
								tokenRequestMethod = "GET";

								return {
									accessToken: customMockResponse.access_token,
									refreshToken: customMockResponse.refresh_token,
									accessTokenExpiresAt: new Date(
										Date.now() + customMockResponse.expires_in * 1000,
									),
									scopes: customMockResponse.scope.split(" "),
									raw: customMockResponse,
								};
							},
							getUserInfo: async (tokens) => {
								userInfoTokenUsed = tokens.accessToken || "";

								// Access provider-specific fields from raw
								const userId = tokens.raw?.user_id as string;
								const customField = tokens.raw?.custom_field as string;

								// Verify provider-specific fields are preserved
								expect(userId).toBe(customMockResponse.user_id);
								expect(customField).toBe(customMockResponse.custom_field);

								return {
									id: userId,
									name: customUserInfo.display_name,
									email: `${userId}@example.com`,
									image: customUserInfo.avatar_url,
									emailVerified: true,
								};
							},
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
			providerId: "custom-get-provider",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/welcome",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});

		expect(res.data?.url).toContain(`http://localhost:${port}/authorize`);
		expect(res.data?.url).toContain("scope=profile");

		// Complete the OAuth flow
		const { callbackURL, headers: newHeaders } = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);

		// Verify the flow completed successfully
		expect(callbackURL).toBe("http://localhost:3000/welcome");
		expect(tokenRequestMethod).toBe("GET");
		expect(userInfoTokenUsed).toBe(customMockResponse.access_token);

		// Verify user was created with custom provider data
		const session = await authClient.getSession({
			fetchOptions: {
				headers: newHeaders,
			},
		});

		expect(session.data).not.toBeNull();
		expect(session.data?.user.name).toBe(customUserInfo.display_name);
		expect(session.data?.user.image).toBe(customUserInfo.avatar_url);
	});
});
