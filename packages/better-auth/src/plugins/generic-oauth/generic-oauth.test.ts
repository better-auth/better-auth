import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { genericOAuth } from ".";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuthClient } from "./client";

import { betterFetch } from "@better-fetch/fetch";
import { OAuth2Server } from "oauth2-mock-server";
import { parseSetCookieHeader } from "../../cookies";

let server = new OAuth2Server();

describe("oauth2", async () => {
	const providerId = "test";
	const clientId = "test-client-id";
	const clientSecret = "test-client-secret";

	const { customFetchImpl, auth } = await getTestInstance({
		plugins: [
			genericOAuth({
				config: [
					{
						providerId,
						discoveryUrl:
							server.issuer.url ||
							"http://localhost:8081/.well-known/openid-configuration",
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
		await context.internalAdapter.createUser({
			email: "oauth2@test.com",
			name: "OAuth2 Test",
		});
		await server.issuer.keys.generate("RS256");

		server.issuer.on;
		// Start the server
		await server.start(8081, "localhost");
		console.log("Issuer URL:", server.issuer.url); // -> http://localhost:8081
	});

	afterAll(async () => {
		await server.stop().catch(() => {});
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

		let callbackURL = "";
		const newHeaders = new Headers();
		await betterFetch(location, {
			method: "GET",
			customFetchImpl: fetchImpl || customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
				newHeaders.set(
					"cookie",
					context.response.headers.get("Set-Cookie") || "",
				);
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
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("http://localhost:8081/authorize"),
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
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("http://localhost:8081/authorize"),
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
							discoveryUrl:
								"http://localhost:8081/.well-known/openid-configuration",
							clientId: clientId,
							clientSecret: clientSecret,
							redirectURI: "http://localhost:3000/api/auth/callback/test2",
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

		const res = await authClient.signIn.oauth2({
			providerId: "test2",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});
		expect(res.data?.url).toContain("http://localhost:8081/authorize");
		const headers = new Headers();
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

		const { customFetchImpl } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test2",
							discoveryUrl:
								"http://localhost:8081/.well-known/openid-configuration",
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

		const res = await authClient.signIn.oauth2({
			providerId: "test2",
			callbackURL: "http://localhost:3000/dashboard",
			errorCallbackURL: "http://localhost:3000/error",
		});
		expect(res.data?.url).toContain("http://localhost:8081/authorize");
		const headers = new Headers();
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

		const { customFetchImpl } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test2",
							discoveryUrl:
								"http://localhost:8081/.well-known/openid-configuration",
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

		const res = await authClient.signIn.oauth2({
			providerId: "test2",
			callbackURL: "http://localhost:3000/dashboard",
			errorCallbackURL: "http://localhost:3000/error",
			requestSignUp: true,
		});
		expect(res.data?.url).toContain("http://localhost:8081/authorize");
		const headers = new Headers();
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

		const { customFetchImpl } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "test3",
							discoveryUrl:
								"http://localhost:8081/.well-known/openid-configuration",
							clientId: clientId,
							clientSecret: clientSecret,
							pkce: true,
							authorizationHeaders: customHeaders,
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

		const res = await authClient.signIn.oauth2({
			providerId: "test3",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		expect(res.data?.url).toContain("http://localhost:8081/authorize");
		const headers = new Headers();
		await simulateOAuthFlow(res.data?.url || "", headers, customFetchImpl);

		expect(receivedHeaders).toHaveProperty("x-custom-header");
		expect(receivedHeaders["x-custom-header"]).toBe("test-value");
	});

	it("should delete oauth user with verification flow without password", async () => {
		let token = "";
		const { customFetchImpl } = await getTestInstance({
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
							discoveryUrl:
								"http://localhost:8081/.well-known/openid-configuration",
							clientId: clientId,
							clientSecret: clientSecret,
						},
					],
				}),
			],
		});

		const client = createAuthClient({
			plugins: [genericOAuthClient()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const signInRes = await client.signIn.oauth2({
			providerId: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});

		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("http://localhost:8081/authorize"),
			redirect: true,
		});

		const { headers } = await simulateOAuthFlow(
			signInRes.data?.url || "",
			new Headers(),
			customFetchImpl,
		);

		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data).not.toBeNull();

		const deleteRes = await client.deleteUser({
			fetchOptions: {
				headers,
			},
		});

		expect(deleteRes.data).toMatchObject({
			success: true,
		});

		expect(token.length).toBe(32);

		const deleteCallbackRes = await client.deleteUser({
			token,
			fetchOptions: {
				headers,
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
});
