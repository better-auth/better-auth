import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseJSON } from "../../client/parser";
import { signJWT, symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { oAuthProxy } from ".";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
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
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
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
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("oauth-proxy", async () => {
	it("should redirect to proxy url with profile data (passthrough)", async () => {
		const { client } = await getTestInstance({
			plugins: [
				oAuthProxy({
					currentURL: "http://preview-localhost:3000",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});

		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);

		const state = new URL(res.url!).searchParams.get("state");

		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context) {
				const location = context.response.headers.get("location") ?? "";
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain(
					"http://preview-localhost:3000/api/auth/oauth-proxy-callback",
				);
				expect(location).toContain("callbackURL");
				// Should have profile parameter (passthrough mode)
				const profile = new URL(location).searchParams.get("profile");
				expect(profile).toBeTruthy();
			},
		});
	});

	it("shouldn't redirect to proxy url on same origin", async () => {
		const { client, cookieSetter } = await getTestInstance({
			plugins: [oAuthProxy()],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const headers = new Headers();
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			headers,
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).not.toContain("/api/auth/oauth-proxy-callback");
				expect(location).toContain("/dashboard");
			},
		});
	});

	it("should proxy to the original request url", async () => {
		const { client } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [
				oAuthProxy({
					productionURL: "https://login.myapp.com",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain(
					"https://myapp.com/api/auth/oauth-proxy-callback?callbackURL=%2Fdashboard",
				);
				// Should have profile parameter (passthrough mode)
				const profile = new URL(location).searchParams.get("profile");
				expect(profile).toBeTruthy();
			},
		});
	});

	it("should require state cookie if it's not in proxy url", async () => {
		const { client } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [
				oAuthProxy({
					productionURL: "https://myapp.com",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain("state_mismatch");
			},
		});
	});

	it("shouldn't redirect to proxy url on same origin (with productionURL)", async () => {
		const { client, cookieSetter } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [
				oAuthProxy({
					productionURL: "https://myapp.com",
				}),
			],
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
				},
			},
		});
		const headers = new Headers();
		const res = await client.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			headers,
			onError(context) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).not.toContain("/api/auth/oauth-proxy-callback");
				expect(location).toContain("/dashboard");
			},
		});
	});

	describe("stateless mode (cookie-based)", () => {
		it("should encrypt state package for cross-origin OAuth", async () => {
			const { client } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");
			expect(state).toBeTruthy();

			// State should be an encrypted package, not the original state
			// In stateless mode, the state parameter contains encrypted data
			expect(state!.length).toBeGreaterThan(50); // Encrypted data is longer
		});

		it("should handle OAuth callback with encrypted state package", async () => {
			const { client } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			// Initiate sign-in
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const encryptedState = new URL(res.url!).searchParams.get("state");
			expect(encryptedState).toBeTruthy();

			// Simulate OAuth provider callback with encrypted state
			await client.$fetch(
				`/callback/google?code=test&state=${encryptedState}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toBeTruthy();

						// Should redirect to proxy callback with profile data
						expect(location).toContain("/oauth-proxy-callback");
						expect(location).toContain("callbackURL");
						expect(location).toContain("profile");
					},
				},
			);
		});

		it("should decrypt state package correctly", async () => {
			const { client, auth } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const { secret } = await auth.$context;

			// Perform OAuth flow to get encrypted state
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const encryptedState = new URL(res.url!).searchParams.get("state");
			expect(encryptedState).toBeTruthy();

			// Verify we can decrypt the state package
			const decrypted = await symmetricDecrypt({
				key: secret,
				data: encryptedState!,
			});

			const statePackage = parseJSON<{
				state: string;
				stateCookie: string;
				isOAuthProxy: boolean;
			}>(decrypted);

			// Verify state package structure
			expect(statePackage).toHaveProperty("state");
			expect(statePackage).toHaveProperty("stateCookie");
			expect(statePackage).toHaveProperty("isOAuthProxy");
			expect(statePackage.isOAuthProxy).toBe(true);
		});

		it("should work on same origin without proxy", async () => {
			const { client, cookieSetter } = await getTestInstance({
				database: undefined, // Stateless mode
				plugins: [
					oAuthProxy({
						productionURL: "http://localhost:3000",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const headers = new Headers();
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
					onSuccess: cookieSetter(headers),
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			// On same origin, state should NOT be encrypted package
			// It should be the regular random state
			expect(state!.length).toBeLessThan(50);

			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				headers,
				onError(context) {
					const location = context.response.headers.get("location");

					// Should NOT redirect to proxy
					expect(location).not.toContain("/oauth-proxy-callback");
					expect(location).toContain("/dashboard");
				},
			});
		});
	});

	describe("passthrough mode", () => {
		it("should include profile data in passthrough payload", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});

			const { secret } = await auth.$context;

			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			let encryptedProfile: string | null = null;
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				onError(context) {
					const location = context.response.headers.get("location");
					if (location && location.includes("profile=")) {
						const url = new URL(location);
						encryptedProfile = url.searchParams.get("profile");
					}
				},
			});

			expect(encryptedProfile).toBeTruthy();

			// Decrypt and verify profile data
			const decrypted = await symmetricDecrypt({
				key: secret,
				data: encryptedProfile!,
			});
			const payload = parseJSON<{
				userInfo: {
					id: string;
					email: string;
					name?: string;
					emailVerified: boolean;
				};
				account: {
					providerId: string;
					accountId: string;
					accessToken?: string;
					refreshToken?: string;
				};
				state: string;
				callbackURL: string;
				timestamp: number;
			}>(decrypted);

			expect(payload.userInfo).toBeDefined();
			expect(payload.userInfo.email).toBe("user@email.com");
			expect(payload.account).toBeDefined();
			expect(payload.account.providerId).toBe("google");
			expect(payload.state).toBeDefined();
			expect(payload.timestamp).toBeDefined();
		});

		it("should create user/session on preview from profile data", async () => {
			// Production instance - handles OAuth callback
			const production = await getTestInstance(
				{
					plugins: [
						oAuthProxy({
							currentURL: "http://preview.example.com",
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			// Preview instance with SEPARATE database
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					plugins: [oAuthProxy()],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			// Step 1: Start OAuth on production
			const res = await production.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			// Step 2: Complete OAuth callback on production - passthrough mode
			let encryptedProfile: string | null = null;
			let callbackURL: string | null = null;
			await production.client.$fetch(
				`/callback/google?code=test&state=${state}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						if (location && location.includes("profile=")) {
							const url = new URL(location);
							encryptedProfile = url.searchParams.get("profile");
							callbackURL = url.searchParams.get("callbackURL");
						}
					},
				},
			);

			expect(encryptedProfile).toBeTruthy();

			// Verify production DB is EMPTY (passthrough doesn't create user on production)
			const productionCtx = await production.auth.$context;
			const productionUsers = await productionCtx.internalAdapter.listUsers();
			expect(productionUsers.length).toBe(0);

			// Verify preview DB is empty before proxy callback
			const previewCtx = await preview.auth.$context;
			const previewUsersBefore = await previewCtx.internalAdapter.listUsers();
			expect(previewUsersBefore.length).toBe(0);

			// Step 3: Call oauth-proxy-callback on preview instance
			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("/dashboard");
					},
				},
			);

			// Step 4: Verify user was created ONLY in preview DB
			const previewUsersAfter = await previewCtx.internalAdapter.listUsers();
			expect(previewUsersAfter.length).toBe(1);
			expect(previewUsersAfter[0]?.email).toBe("user@email.com");

			// Verify account was created
			const previewAccounts = await previewCtx.internalAdapter.findAccounts(
				previewUsersAfter[0]!.id,
			);
			expect(previewAccounts.length).toBe(1);
			expect(previewAccounts[0]?.providerId).toBe("google");

			// Verify session was created
			const previewSessions = await previewCtx.internalAdapter.listSessions(
				previewUsersAfter[0]!.id,
			);
			expect(previewSessions.length).toBe(1);
		});

		it("should reject expired profile payloads", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
						maxAge: 60, // 60 seconds
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});
			const { secret } = await auth.$context;

			// Create expired profile payload
			const payload = {
				userInfo: {
					id: "123",
					email: "user@email.com",
					name: "Test User",
					emailVerified: true,
				},
				account: {
					providerId: "google",
					accountId: "123",
					accessToken: "test",
				},
				state: "test-state",
				callbackURL: "/dashboard",
				timestamp: Date.now() - 120000, // 2 minutes ago
			};

			const encryptedProfile = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&profile=${encryptedProfile}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=PAYLOAD_EXPIRED");
					},
				},
			);
		});

		it("should use custom maxAge setting", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
						maxAge: 5, // 5 seconds
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			});
			const { secret } = await auth.$context;

			// Create payload that's 10 seconds old (older than maxAge of 5)
			const payload = {
				userInfo: {
					id: "123",
					email: "user@email.com",
					name: "Test User",
					emailVerified: true,
				},
				account: {
					providerId: "google",
					accountId: "123",
					accessToken: "test",
				},
				state: "test-state",
				callbackURL: "/dashboard",
				timestamp: Date.now() - 10000, // 10 seconds ago
			};

			const encryptedProfile = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&profile=${encryptedProfile}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=PAYLOAD_EXPIRED");
					},
				},
			);
		});

		it("should work with database mode + UUID", async () => {
			// This tests the scenario where:
			// - storeStateStrategy is "database" (not cookie)
			// - generateId: "uuid" is configured
			// Passthrough mode should work without any issues
			const { client, auth } = await getTestInstance(
				{
					plugins: [
						oAuthProxy({
							currentURL: "http://preview.example.com",
						}),
					],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
					advanced: {
						database: {
							generateId: "uuid",
						},
					},
				},
				{
					testWith: "postgres",
				},
			);

			const { secret } = await auth.$context;

			// Start OAuth flow
			const res = await client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			// Complete OAuth callback - this should work without UUID format errors
			let encryptedProfile: string | null = null;
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				onError(context) {
					const location = context.response.headers.get("location");
					if (location && location.includes("profile=")) {
						const url = new URL(location);
						encryptedProfile = url.searchParams.get("profile");
					}
				},
			});

			expect(encryptedProfile).toBeTruthy();

			// Verify profile data structure
			const decrypted = await symmetricDecrypt({
				key: secret,
				data: encryptedProfile!,
			});
			const payload = parseJSON<{
				userInfo: unknown;
				account: {
					providerId: string;
				};
			}>(decrypted);

			expect(payload.userInfo).toBeDefined();
			expect(payload.account).toBeDefined();
			expect(payload.account.providerId).toBe("google");
		});

		it("should handle existing user on preview", async () => {
			// Preview instance
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					plugins: [oAuthProxy()],
					socialProviders: {
						google: {
							clientId: "test",
							clientSecret: "test",
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

			const previewCtx = await preview.auth.$context;
			const { secret } = previewCtx;

			// Pre-create user in preview DB
			await previewCtx.internalAdapter.createUser({
				id: "existing-user-id",
				email: "user@email.com",
				name: "Existing User",
				emailVerified: true,
			});

			// Create profile payload for the SAME email
			const payload = {
				userInfo: {
					id: "google-user-id",
					email: "user@email.com",
					name: "New Name",
					emailVerified: true,
				},
				account: {
					providerId: "google",
					accountId: "google-user-id",
					accessToken: "test123",
				},
				state: "test-state",
				callbackURL: "/dashboard",
				timestamp: Date.now(),
			};

			const encrypted = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload),
			});

			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=/dashboard&profile=${encodeURIComponent(encrypted)}`,
				{
					onError(context) {
						expect(context.response.status).toBe(302);
						const location = context.response.headers.get("location");
						expect(location).toContain("/dashboard");
					},
				},
			);

			// User count should still be 1 (linked account, not new user)
			const users = await previewCtx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.email).toBe("user@email.com");

			// Should have linked the google account
			const accounts = await previewCtx.internalAdapter.findAccounts(
				users[0]!.id,
			);
			expect(accounts.length).toBe(1);
			expect(accounts[0]?.providerId).toBe("google");
		});
	});
});
