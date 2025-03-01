import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { genericOAuth } from ".";
import { genericOAuthClient } from "./client";
import { createAuthClient } from "../../client";

import { OAuth2Server } from "oauth2-mock-server";
import { betterFetch } from "@better-fetch/fetch";
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
		await betterFetch(location, {
			method: "GET",
			customFetchImpl: fetchImpl || customFetchImpl,
			headers,
			onError(context) {
				callbackURL = context.response.headers.get("location") || "";
			},
		});

		return callbackURL;
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
		const callbackURL = await simulateOAuthFlow(
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
		const callbackURL = await simulateOAuthFlow(
			signInRes.data?.url || "",
			headers,
		);
		expect(callbackURL).toBe("http://localhost:3000/new_user");
	});

	it("should redirect to the provider and handle the response after linked", async () => {
		let headers = new Headers();
		const res = await authClient.signIn.oauth2({
			providerId: "test",
			callbackURL: "http://localhost:3000/dashboard",
			newUserCallbackURL: "http://localhost:3000/new_user",
		});
		const callbackURL = await simulateOAuthFlow(res.data?.url || "", headers);
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

		const callbackURL = await simulateOAuthFlow(res.data?.url || "", headers);
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
		const callbackURL = await simulateOAuthFlow(
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
		const callbackURL = await simulateOAuthFlow(
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
		const callbackURL = await simulateOAuthFlow(
			res.data?.url || "",
			headers,
			customFetchImpl,
		);
		expect(callbackURL).toBe("http://localhost:3000/dashboard");
	});
});
