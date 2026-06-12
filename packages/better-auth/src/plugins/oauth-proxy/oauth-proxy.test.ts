import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
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

		/**
		 * Cookie strategy with a dedicated proxy `secret` that differs from
		 * `BETTER_AUTH_SECRET`. The `oauth_state` cookie is encrypted with the
		 * environment secret, so the proxy must re-encrypt it with the proxy key
		 * for the production callback to recover the inner state. Without that,
		 * the callback fails to decrypt the state package and produces no
		 * passthrough profile.
		 *
		 * @see https://github.com/better-auth/better-auth/pull/9385
		 */
		it("recovers cookie-strategy state when the proxy secret differs from the env secret", async () => {
			const { client } = await getTestInstance({
				secret: "env-secret-not-shared",
				account: { storeStateStrategy: "cookie" },
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
						secret: "shared-proxy-secret",
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

			let encryptedProfile: string | null = null;
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				onError(context) {
					const location = context.response.headers.get("location");
					if (location?.includes("profile=")) {
						encryptedProfile = new URL(location).searchParams.get("profile");
					}
				},
			});

			expect(encryptedProfile).toBeTruthy();
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

		it("should forward result.error verbatim instead of collapsing to user_creation_failed", async () => {
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
							disableSignUp: true,
						},
					},
				},
				{ disableTestUser: true },
			);

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
				{ disableTestUser: true },
			);

			const res = await production.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{ throw: true },
			);
			const state = new URL(res.url!).searchParams.get("state");

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

			let proxyRedirect: string | null = null;
			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						proxyRedirect = context.response.headers.get("location");
					},
				},
			);
			expect(proxyRedirect).toBeTruthy();
			const url = new URL(proxyRedirect!);
			expect(url.searchParams.get("error")).toBe("signup_disabled");
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
						expect(location).toContain("error=payload_expired");
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
						expect(location).toContain("error=payload_expired");
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

		it("should reject payloads with missing required fields", async () => {
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

			// Test missing timestamp
			const payloadMissingTimestamp = {
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
				// timestamp intentionally missing
			};

			const encrypted1 = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payloadMissingTimestamp),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&profile=${encrypted1}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=invalid_payload");
					},
				},
			);

			// Test missing userInfo
			const payloadMissingUserInfo = {
				account: {
					providerId: "google",
					accountId: "123",
					accessToken: "test",
				},
				state: "test-state",
				callbackURL: "/dashboard",
				timestamp: Date.now(),
			};

			const encrypted2 = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payloadMissingUserInfo),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&profile=${encrypted2}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=invalid_payload");
					},
				},
			);

			// Test non-numeric timestamp (should not bypass validation)
			const payloadStringTimestamp = {
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
				timestamp: "not-a-number",
			};

			const encrypted3 = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payloadStringTimestamp),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&profile=${encrypted3}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error=invalid_payload");
					},
				},
			);
		});

		it("should use dedicated secret instead of global secret", async () => {
			const dedicatedSecret = "oauth-proxy-dedicated-secret-key";

			const production = await getTestInstance(
				{
					plugins: [
						oAuthProxy({
							currentURL: "http://preview.example.com",
							secret: dedicatedSecret,
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

			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					plugins: [
						oAuthProxy({
							secret: dedicatedSecret,
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

			// Step 2: Complete OAuth callback on production
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

			// Verify: encrypted with dedicated secret, NOT with global secret
			const decryptedWithDedicated = await symmetricDecrypt({
				key: dedicatedSecret,
				data: encryptedProfile!,
			});
			expect(decryptedWithDedicated).toContain("user@email.com");

			const { secret: globalSecret } = await production.auth.$context;
			await expect(
				symmetricDecrypt({
					key: globalSecret,
					data: encryptedProfile!,
				}),
			).rejects.toThrow();

			// Step 3: Preview can decrypt and create user
			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("/dashboard");
					},
				},
			);

			const previewCtx = await preview.auth.$context;
			const users = await previewCtx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.email).toBe("user@email.com");
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

	/**
	 *
	 * Tests that oauth-proxy-callback correctly skips the state cookie check
	 * when cleaning up OAuth state. In the proxy flow:
	 * 1. User starts OAuth on preview - state cookie set on preview domain
	 * 2. OAuth provider redirects to production
	 * 3. Production redirects to preview's oauth-proxy-callback
	 * 4. parseGenericState is called to clean up, but the state cookie
	 *    may not be present (cross-origin redirect) or may not match
	 *
	 * The fix is to pass `skipStateCookieCheck: true` when calling parseGenericState
	 * in the oauth-proxy-callback endpoint.
	 */
	describe("database mode state cleanup", () => {
		it("should not fail when state cookie is missing during proxy callback cleanup", async () => {
			// This test simulates the scenario where:
			// - Both preview and production share the SAME database
			// - State storage is "database" (default)
			// - The state cookie was set on preview, but when oauth-proxy-callback
			//   is called, the cookie may not be present

			// Use a shared database for both instances
			const { client: productionClient, auth: productionAuth } =
				await getTestInstance(
					{
						baseURL: "http://localhost:3000",
						plugins: [
							oAuthProxy({
								currentURL: "http://preview.example.com",
								productionURL: "http://localhost:3000",
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

			// Step 1: Initiate OAuth flow
			const res = await productionClient.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			const state = new URL(res.url!).searchParams.get("state");

			// Step 2: Complete OAuth callback to get encrypted profile
			let encryptedProfile: string | null = null;
			let callbackURL: string | null = null;
			await productionClient.$fetch(
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
			expect(callbackURL).toBeTruthy();

			// Step 3: Call oauth-proxy-callback WITHOUT cookies (simulating cross-origin)
			// This is the key: we explicitly DON'T pass any cookies/headers
			// to simulate the state cookie not being present
			const _response = await productionClient.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						// The callback should succeed and redirect to dashboard
						// NOT fail with state_mismatch error
						expect(location).not.toContain("error=");
						expect(location).toContain("/dashboard");
					},
				},
			);

			// Verify user was created successfully
			const ctx = await productionAuth.$context;
			const users = await ctx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.email).toBe("user@email.com");
		});

		it("should handle state cleanup gracefully when verification is already deleted", async () => {
			// This tests that parseGenericState errors are caught and don't break the flow
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
				},
				{
					disableTestUser: true,
				},
			);

			const { secret, internalAdapter } = await auth.$context;

			// Create a valid payload with a state that doesn't exist in DB
			const payload = {
				userInfo: {
					id: "123",
					email: "test@email.com",
					name: "Test User",
					emailVerified: true,
				},
				account: {
					providerId: "google",
					accountId: "123",
					accessToken: "test",
				},
				state: "non-existent-state-id",
				callbackURL: "/dashboard",
				timestamp: Date.now(),
			};

			const encryptedProfile = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload),
			});

			// The callback should still succeed even if state cleanup fails
			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=/dashboard&profile=${encodeURIComponent(encryptedProfile)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						// Should redirect to dashboard, not error
						expect(location).not.toContain("error=state_mismatch");
						expect(location).toContain("/dashboard");
					},
				},
			);

			// Verify user was created
			const users = await internalAdapter.listUsers();
			expect(users.length).toBe(1);
		});
	});

	/**
	 * Tests for secret configuration across environments.
	 * When production and preview have different BETTER_AUTH_SECRET values,
	 * a shared `secret` must be configured in the oAuthProxy options.
	 */
	describe("secret configuration", () => {
		/**
		 * This test verifies that when production and preview have DIFFERENT secrets
		 * (without a shared oAuthProxy secret configured), the callback fails because
		 * the before hook can't decrypt the state package.
		 *
		 * This is the root cause of the issue where users see:
		 * "ERROR [Better Auth]: Failed to parse state BetterAuthError: State mismatch: State not persisted correctly"
		 */
		it("should fail when preview and production have different secrets (no shared secret)", async () => {
			// Preview instance with its own secret
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					secret: "preview-secret-key-that-is-different",
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
							// Note: NO shared secret configured - this is the problem
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

			// Production instance with a DIFFERENT secret
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					secret: "production-secret-key-that-is-different",
					plugins: [
						oAuthProxy({
							// Note: NO shared secret configured
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

			// Step 1: Start OAuth on preview
			const res = await preview.client.signIn.social(
				{
					provider: "google",
					callbackURL: "/dashboard",
				},
				{
					throw: true,
				},
			);

			// The state is encrypted with preview's secret
			const encryptedState = new URL(res.url!).searchParams.get("state");
			expect(encryptedState).toBeTruthy();

			// Step 2: OAuth callback arrives at production
			// Production tries to decrypt with its own secret - THIS FAILS
			// The before hook catches the error and returns early
			// The regular callback handler runs and fails
			await production.client.$fetch(
				`/callback/google?code=test&state=${encryptedState}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						// Should fail with state error because regular callback runs
						expect(location).toMatch(/error=.*state|please_restart/i);
					},
				},
			);
		});

		/**
		 * This test verifies the CORRECT configuration: using a shared secret
		 * for the oauth-proxy plugin across all environments.
		 */
		it("should work correctly when a shared secret is configured", async () => {
			const sharedProxySecret = "shared-oauth-proxy-secret-for-all-envs";

			// Preview instance with shared proxy secret
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					secret: "preview-main-secret", // Main secret can be different
					plugins: [
						oAuthProxy({
							productionURL: "http://localhost:3000",
							secret: sharedProxySecret, // SHARED secret for proxy
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

			// Production instance with the SAME shared proxy secret
			const production = await getTestInstance(
				{
					baseURL: "http://localhost:3000",
					secret: "production-main-secret", // Main secret can be different
					plugins: [
						oAuthProxy({
							secret: sharedProxySecret, // SAME shared secret for proxy
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

			// Step 1: Start OAuth on preview (the non-production environment)
			const res = await preview.client.signIn.social(
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

			// Step 2: OAuth callback arrives at production
			// Production can decrypt because it uses the same shared secret
			let encryptedProfile: string | null = null;
			let callbackURL: string | null = null;
			await production.client.$fetch(
				`/callback/google?code=test&state=${encryptedState}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						// Should redirect to preview's oauth-proxy-callback
						expect(location).toContain("preview.example.com");
						expect(location).toContain("/oauth-proxy-callback");

						if (location && location.includes("profile=")) {
							const url = new URL(location);
							encryptedProfile = url.searchParams.get("profile");
							callbackURL = url.searchParams.get("callbackURL");
						}
					},
				},
			);

			expect(encryptedProfile).toBeTruthy();

			// Step 3: Preview receives the callback
			// Preview can decrypt the profile because it uses the same shared secret
			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&profile=${encodeURIComponent(encryptedProfile!)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						// Should successfully redirect to dashboard
						expect(location).not.toContain("error=");
						expect(location).toContain("/dashboard");
					},
				},
			);

			// Verify user was created on preview
			const previewCtx = await preview.auth.$context;
			const users = await previewCtx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.email).toBe("user@email.com");
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8889
	 */
	it("should read code from POST body for form_post response mode", async () => {
		const { client } = await getTestInstance({
			database: undefined,
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

		const encryptedState = new URL(res.url!).searchParams.get("state");
		expect(encryptedState).toBeTruthy();

		// Simulate Apple's form_post: code and state are in the POST body, not the query string
		await client.$fetch(`/callback/google`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				code: "test",
				state: encryptedState!,
			}).toString(),
			onError(context) {
				const location = context.response.headers.get("location") ?? "";
				expect(location).not.toContain("error=no_code");
				expect(location).not.toContain("error=invalid");
				// Should redirect to proxy callback with profile data
				expect(location).toContain("/oauth-proxy-callback");
				expect(location).toContain("profile");
			},
		});
	});
});

describe("oauth-proxy current URL trust", () => {
	it("does not use an untrusted request origin as the proxy callback receiver", async () => {
		const { auth } = await getTestInstance({
			baseURL: "https://myapp.com",
			plugins: [oAuthProxy({ productionURL: "https://login.myapp.com" })],
			socialProviders: {
				google: { clientId: "test", clientSecret: "test" },
			},
		});

		// Sign-in initiated from a request host that is not
		// a trusted origin.
		const signInResponse = await auth.handler(
			new Request("https://untrusted.example/api/auth/sign-in/social", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
			}),
		);
		const { url } = (await signInResponse.json()) as { url: string };
		const state = new URL(url).searchParams.get("state");

		const callbackResponse = await auth.handler(
			new Request(
				`https://login.myapp.com/api/auth/callback/google?code=test&state=${state}`,
				{ method: "GET" },
			),
		);
		const location = callbackResponse.headers.get("location");
		expect(location).toBeTruthy();
		// Falls back to the configured base URL, never the untrusted request origin.
		expect(location).not.toContain("untrusted.example");
		expect(location).toContain(
			"https://myapp.com/api/auth/oauth-proxy-callback",
		);
	});

	it("uses an explicitly trusted request origin as the proxy callback receiver", async () => {
		const { auth } = await getTestInstance({
			baseURL: "https://myapp.com",
			trustedOrigins: ["https://preview.myapp.com"],
			plugins: [oAuthProxy({ productionURL: "https://login.myapp.com" })],
			socialProviders: {
				google: { clientId: "test", clientSecret: "test" },
			},
		});

		const signInResponse = await auth.handler(
			new Request("https://preview.myapp.com/api/auth/sign-in/social", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider: "google", callbackURL: "/dashboard" }),
			}),
		);
		const { url } = (await signInResponse.json()) as { url: string };
		const state = new URL(url).searchParams.get("state");

		const callbackResponse = await auth.handler(
			new Request(
				`https://login.myapp.com/api/auth/callback/google?code=test&state=${state}`,
				{ method: "GET" },
			),
		);
		const location = callbackResponse.headers.get("location");
		expect(location).toContain(
			"https://preview.myapp.com/api/auth/oauth-proxy-callback",
		);
	});

	it("falls back to the base URL when the platform vendor value is not a URL", async () => {
		// AWS Lambda / GCP / Azure expose a bare function name, not a URL.
		vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "my-lambda-function");
		try {
			const { auth } = await getTestInstance({
				baseURL: "https://myapp.com",
				plugins: [oAuthProxy({ productionURL: "https://login.myapp.com" })],
				socialProviders: {
					google: { clientId: "test", clientSecret: "test" },
				},
			});

			const signInResponse = await auth.handler(
				new Request("https://untrusted.example/api/auth/sign-in/social", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						provider: "google",
						callbackURL: "/dashboard",
					}),
				}),
			);
			const { url } = (await signInResponse.json()) as { url: string };
			const state = new URL(url).searchParams.get("state");

			const callbackResponse = await auth.handler(
				new Request(
					`https://login.myapp.com/api/auth/callback/google?code=test&state=${state}`,
					{ method: "GET" },
				),
			);
			const location = callbackResponse.headers.get("location");
			expect(location).toContain(
				"https://myapp.com/api/auth/oauth-proxy-callback",
			);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
