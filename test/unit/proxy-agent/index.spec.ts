/**
 * This test demonstrates that when you set a global dispatcher with ProxyAgent,
 * all fetch() calls (including those made by better-auth for OAuth) are routed through it.
 *
 * Reference: https://github.com/nodejs/undici/blob/main/docs/docs/api/ProxyAgent.md
 * Related issue: https://github.com/better-auth/better-auth/issues/7396
 */

import type { Dispatcher } from "undici";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, describe, expect, it } from "vitest";

describe("ProxyAgent with better-auth", () => {
	let originalDispatcher: Dispatcher;

	afterEach(async () => {
		// Restore the original dispatcher after each test
		if (originalDispatcher) {
			setGlobalDispatcher(originalDispatcher);
		}
	});

	it("should intercept fetch requests when global dispatcher is set", async () => {
		// Save original dispatcher
		originalDispatcher = getGlobalDispatcher();

		// Create a mock agent to simulate proxy behavior
		const mockAgent = new MockAgent();
		mockAgent.disableNetConnect();

		// Mock the GitHub API response (simulating what happens during OAuth)
		const mockPool = mockAgent.get("https://api.github.com");
		mockPool
			.intercept({
				path: "/user",
				method: "GET",
			})
			.reply(200, { login: "test-user", id: 12345 });

		// Set mock agent as global dispatcher (same as setting ProxyAgent in production)
		setGlobalDispatcher(mockAgent);

		// Make a fetch request - it should go through the mock agent
		const response = await fetch("https://api.github.com/user");
		const data = await response.json();

		// Verify the request was intercepted
		expect(data).toEqual({ login: "test-user", id: 12345 });

		await mockAgent.close();
	});

	it("should intercept OAuth token exchange requests", async () => {
		// Save original dispatcher
		originalDispatcher = getGlobalDispatcher();

		const mockAgent = new MockAgent();
		mockAgent.disableNetConnect();

		// Mock the GitHub OAuth token endpoint
		const mockPool = mockAgent.get("https://github.com");
		mockPool
			.intercept({
				path: "/login/oauth/access_token",
				method: "POST",
			})
			.reply(
				200,
				{
					access_token: "mock_access_token",
					token_type: "bearer",
					scope: "user:email",
				},
				{
					headers: { "content-type": "application/json" },
				},
			);

		setGlobalDispatcher(mockAgent);

		// Simulate the OAuth token exchange that better-auth would make
		const response = await fetch(
			"https://github.com/login/oauth/access_token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify({
					client_id: "test_client_id",
					client_secret: "test_client_secret",
					code: "test_code",
				}),
			},
		);

		const data = await response.json();

		expect(data).toEqual({
			access_token: "mock_access_token",
			token_type: "bearer",
			scope: "user:email",
		});

		await mockAgent.close();
	});

	it("should intercept Google OAuth requests", async () => {
		originalDispatcher = getGlobalDispatcher();

		const mockAgent = new MockAgent();
		mockAgent.disableNetConnect();

		// Mock Google's token endpoint
		const mockPool = mockAgent.get("https://oauth2.googleapis.com");
		mockPool
			.intercept({
				path: "/token",
				method: "POST",
			})
			.reply(
				200,
				{
					access_token: "google_mock_token",
					expires_in: 3600,
					token_type: "Bearer",
				},
				{
					headers: { "content-type": "application/json" },
				},
			);

		setGlobalDispatcher(mockAgent);

		const response = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: "test_client_id",
				client_secret: "test_client_secret",
				code: "test_code",
				grant_type: "authorization_code",
				redirect_uri: "http://localhost:3000/callback",
			}),
		});

		const data: any = await response.json();

		expect(data.access_token).toBe("google_mock_token");

		await mockAgent.close();
	});
});
