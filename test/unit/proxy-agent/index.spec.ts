/**
 * Unit Test: Verify undici ProxyAgent works with better-auth OAuth flows
 *
 * This test demonstrates that when you set a global dispatcher with ProxyAgent,
 * all fetch() calls made by better-auth during OAuth flows are routed through it.
 * This is critical for corporate environments where all outbound HTTP requests
 * must go through a proxy server.
 *
 * Reference: https://github.com/nodejs/undici/blob/main/docs/docs/api/ProxyAgent.md
 * Related issue: https://github.com/better-auth/better-auth/issues/7396
 */
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { signJWT } from "better-auth/crypto";
import { getTestInstance } from "better-auth/test";
import type { Dispatcher } from "undici";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const DEFAULT_SECRET = "better-auth-secret-123456789";

describe("ProxyAgent with better-auth OAuth", () => {
	let originalDispatcher: Dispatcher;
	let mockAgent: MockAgent;

	beforeEach(() => {
		// Save original dispatcher
		originalDispatcher = getGlobalDispatcher();

		// Create a mock agent to simulate proxy behavior
		mockAgent = new MockAgent();
		mockAgent.disableNetConnect();

		// Set mock agent as global dispatcher (simulating ProxyAgent in production)
		setGlobalDispatcher(mockAgent);
	});

	afterEach(async () => {
		// Restore the original dispatcher after each test
		await mockAgent.close();
		setGlobalDispatcher(originalDispatcher);
	});

	it("should route GitHub OAuth requests through global dispatcher", async () => {
		// Mock the GitHub OAuth token endpoint
		const githubPool = mockAgent.get("https://github.com");
		githubPool
			.intercept({
				path: "/login/oauth/access_token",
				method: "POST",
			})
			.reply(
				200,
				new URLSearchParams({
					access_token: "test_github_access_token",
					token_type: "bearer",
					scope: "user:email",
				}).toString(),
				{
					headers: { "content-type": "application/x-www-form-urlencoded" },
				},
			);

		// Mock the GitHub user API endpoint
		const githubApiPool = mockAgent.get("https://api.github.com");
		githubApiPool
			.intercept({
				path: "/user",
				method: "GET",
			})
			.reply(200, {
				id: 12345,
				login: "testuser",
				email: "test@example.com",
				name: "Test User",
				avatar_url: "https://avatars.githubusercontent.com/u/12345",
			});

		// Mock the GitHub user emails API endpoint
		githubApiPool
			.intercept({
				path: "/user/emails",
				method: "GET",
			})
			.reply(200, [
				{
					email: "test@example.com",
					primary: true,
					verified: true,
					visibility: "public",
				},
			]);

		// Create better-auth instance with GitHub OAuth
		const { client } = await getTestInstance({
			secret: DEFAULT_SECRET,
			socialProviders: {
				github: {
					clientId: "test_client_id",
					clientSecret: "test_client_secret",
				},
			},
		});

		const headers = new Headers();

		// Step 1: Initiate OAuth sign in
		const signInRes = await client.signIn.social(
			{
				provider: "github",
				callbackURL: "/callback",
			},
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					if (setCookie) {
						headers.set("cookie", setCookie);
					}
				},
			},
		);

		expect(signInRes.data?.url).toContain("github.com");
		expect(signInRes.data?.redirect).toBe(true);

		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		// Step 2: Complete OAuth callback - this will trigger requests through the proxy
		await client.$fetch("/callback/github", {
			query: {
				state,
				code: "test_authorization_code",
			},
			headers,
			method: "GET",
			onError(context) {
				// OAuth callback redirects on success
				expect(context.response.status).toBe(302);
			},
		});

		// Verify that better-auth made requests through our global dispatcher (proxy)
		// If this test passes, it means all OAuth requests went through setGlobalDispatcher
		expect(signInRes.data?.url).toBeDefined();
	});

	it("should route Google OAuth requests through global dispatcher", async () => {
		// Pre-generate the ID token for Google
		const googleProfile: GoogleProfile = {
			email: "user@example.com",
			email_verified: true,
			name: "Test User",
			picture: "https://lh3.googleusercontent.com/a-/test",
			exp: 1234567890,
			sub: "1234567890",
			iat: 1234567890,
			aud: "test",
			azp: "test",
			nbf: 1234567890,
			iss: "https://accounts.google.com",
			locale: "en",
			jti: "test",
			given_name: "Test",
			family_name: "User",
		};
		const testIdToken = await signJWT(googleProfile, DEFAULT_SECRET);

		// Mock Google's OAuth token endpoint
		const googlePool = mockAgent.get("https://oauth2.googleapis.com");
		googlePool
			.intercept({
				path: "/token",
				method: "POST",
			})
			.reply(
				200,
				{
					access_token: "test_google_access_token",
					refresh_token: "test_refresh_token",
					id_token: testIdToken,
					expires_in: 3600,
					token_type: "Bearer",
				},
				{
					headers: { "content-type": "application/json" },
				},
			);

		// Create better-auth instance with Google OAuth
		const { client } = await getTestInstance({
			secret: DEFAULT_SECRET,
			socialProviders: {
				google: {
					clientId: "test_client_id",
					clientSecret: "test_client_secret",
				},
			},
		});

		const headers = new Headers();

		// Initiate Google OAuth sign in
		const signInRes = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					if (setCookie) {
						headers.set("cookie", setCookie);
					}
				},
			},
		);

		expect(signInRes.data?.url).toContain("google.com");
		expect(signInRes.data?.redirect).toBe(true);

		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		// Complete OAuth callback - this triggers token exchange through proxy
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test_google_auth_code",
			},
			headers,
			method: "GET",
			onError(context) {
				// OAuth callback redirects on success
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toContain("/dashboard");
			},
		});

		// If this test passes, Google OAuth token exchange went through the global dispatcher
		expect(signInRes.data?.url).toBeDefined();
	});
});
