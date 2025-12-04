import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseCookies, parseSetCookieHeader } from "../../cookies";
import { signJWT } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { genericOAuthClient } from "../generic-oauth/client";
import { genericOAuth } from "../generic-oauth/index";
import { siwe } from "../siwe";
import { siweClient } from "../siwe/client";
import { lastLoginMethod } from ".";
import { lastLoginMethodClient } from "./client";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	const data: GoogleProfile = {
		email: "github-issue-demo@example.com",
		email_verified: true,
		name: "OAuth Test User",
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
		given_name: "OAuth",
		family_name: "Test",
	};
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
			return HttpResponse.json({
				access_token: "test-access-token",
				refresh_token: "test-refresh-token",
				id_token: testIdToken,
			});
		}),
		http.post("https://provider.example.com/oauth/token", () => {
			return HttpResponse.json({});
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

describe("lastLoginMethod", async () => {
	const { client, cookieSetter, testUser } = await getTestInstance(
		{
			plugins: [
				lastLoginMethod(),
				siwe({
					domain: "example.com",
					async getNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifyMessage({ message, signature }) {
						return (
							signature === "valid_signature" && message === "valid_message"
						);
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [lastLoginMethodClient(), siweClient()],
			},
		},
	);

	it("should set the last login method cookie", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		);
		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBe("email");
	});

	it("should set the last login method cookie for siwe", async () => {
		const headers = new Headers();
		const walletAddress = "0x000000000000000000000000000000000000dEaD";
		const chainId = 1;
		await client.siwe.nonce({ walletAddress, chainId });
		await client.siwe.verify(
			{
				message: "valid_message",
				signature: "valid_signature",
				walletAddress,
				chainId,
				email: "user@example.com",
			},
			{
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		);
		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBe("siwe");
	});

	it("should set the last login method in the database", async () => {
		const { client, auth } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
		});
		const data = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{ throw: true },
		);
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${data.token}`,
			}),
		});
		expect(session?.user.lastLoginMethod).toBe("email");
	});

	it("should set the last login method for siwe in the database", async () => {
		const walletAddress = "0x000000000000000000000000000000000000dEaD";
		const chainId = 1;
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({ storeInDatabase: true }),
					siwe({
						domain: "example.com",
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		await client.siwe.nonce({ walletAddress, chainId });
		const { data } = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
			chainId,
			email: "user@example.com",
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${data?.token}`,
			}),
		});
		expect(session?.user.lastLoginMethod).toBe("siwe");
	});

	it("should NOT set the last login method cookie on failed authentication", async () => {
		const headers = new Headers();
		const response = await client.signIn.email(
			{
				email: testUser.email,
				password: "wrong-password",
			},
			{
				onError(context) {
					cookieSetter(headers)(context);
				},
			},
		);

		expect(response.error).toBeDefined();

		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBeUndefined();
	});

	it("should NOT set the last login method cookie on failed OAuth callback", async () => {
		const headers = new Headers();
		const response = await client.$fetch("/callback/google", {
			method: "GET",
			query: {
				code: "invalid-code",
				state: "invalid-state",
			},
			onError(context) {
				cookieSetter(headers)(context);
			},
		});

		expect(response.error).toBeDefined();

		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBeUndefined();
	});
	it("should update the last login method in the database on subsequent logins", async () => {
		const { client, auth } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
		});

		await client.signUp.email(
			{
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			},
			{ throw: true },
		);

		const emailSignInData = await client.signIn.email(
			{
				email: "test@example.com",
				password: "password123",
			},
			{ throw: true },
		);

		let session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${emailSignInData.token}`,
			}),
		});
		expect((session?.user as any).lastLoginMethod).toBe("email");

		await client.signOut();

		const emailSignInData2 = await client.signIn.email(
			{
				email: "test@example.com",
				password: "password123",
			},
			{ throw: true },
		);

		session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${emailSignInData2.token}`,
			}),
		});

		expect((session?.user as any).lastLoginMethod).toBe("email");
	});

	it("should update the last login method in the database on subsequent logins with email and OAuth", async () => {
		const { client, auth, cookieSetter } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
			account: {
				accountLinking: {
					enabled: true,
					trustedProviders: ["google"],
				},
			},
		});

		await client.signUp.email(
			{
				email: "github-issue-demo@example.com",
				password: "password123",
				name: "GitHub Issue Demo User",
			},
			{ throw: true },
		);

		const emailSignInData = await client.signIn.email(
			{
				email: "github-issue-demo@example.com",
				password: "password123",
			},
			{ throw: true },
		);

		let session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${emailSignInData.token}`,
			}),
		});

		expect((session?.user as any).lastLoginMethod).toBe("email");

		await client.signOut();

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		const headers = new Headers();
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers: oAuthHeaders,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();

				cookieSetter(headers)(context as any);

				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				const lastLoginMethod = cookies.get(
					"better-auth.last_used_login_method",
				)?.value;
				if (lastLoginMethod) {
					expect(lastLoginMethod).toBe("google");
				}
			},
		});

		const oauthSession = await client.getSession({
			fetchOptions: {
				headers: headers,
			},
		});
		expect((oauthSession?.data?.user as any).lastLoginMethod).toBe("google");
	});

	it("should set the last login method for generic OAuth provider with /oauth2/callback/:providerId", async () => {
		const { client, cookieSetter } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({ storeInDatabase: true }),
					genericOAuth({
						config: [
							{
								providerId: "my-provider-id",
								clientId: "test-client-id",
								clientSecret: "test-client-secret",
								authorizationUrl:
									"https://provider.example.com/oauth/authorize",
								tokenUrl: "https://provider.example.com/oauth/token",
								scopes: ["openid", "profile", "email"],
								async getUserInfo(token) {
									return {
										id: "provider-user-123",
										name: "Generic OAuth User",
										email: "generic@example.com",
										image: "https://example.com/avatar.jpg",
										emailVerified: true,
									};
								},
							},
						],
					}),
				],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient(), genericOAuthClient()],
				},
			},
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.oauth2({
			providerId: "my-provider-id",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		const headers = new Headers();
		await client.$fetch("/oauth2/callback/my-provider-id", {
			query: {
				state,
				code: "test",
			},
			headers: oAuthHeaders,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();

				cookieSetter(headers)(context as any);

				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				const lastLoginMethod = cookies.get(
					"better-auth.last_used_login_method",
				)?.value;
				if (lastLoginMethod) {
					expect(lastLoginMethod).toBe("my-provider-id");
				}
			},
		});

		const oauthSession = await client.getSession({
			fetchOptions: {
				headers: headers,
			},
		});
		expect((oauthSession?.data?.user as any).lastLoginMethod).toBe(
			"my-provider-id",
		);
	});
});
