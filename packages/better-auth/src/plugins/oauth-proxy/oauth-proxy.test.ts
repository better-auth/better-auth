import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signJWT, symmetricEncrypt } from "../../crypto";
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
	it("should redirect to proxy url", async () => {
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
		const headers = new Headers();
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
			headers,
			onError(context) {
				const location = context.response.headers.get("location") ?? "";
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).toContain(
					"http://preview-localhost:3000/api/auth/oauth-proxy-callback?callbackURL=%2Fdashboard",
				);
				const cookies = new URL(location).searchParams.get("cookies");
				expect(cookies).toBeTruthy();
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
				const cookies = new URL(location).searchParams.get("cookies");
				expect(cookies).toBeTruthy();
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

	it("shouldn't redirect to proxy url on same origin", async () => {
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
	it("should redirect to proxy url with encrypted payload", async () => {
		const { client, auth } = await getTestInstance({
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

		const mockCookies = {
			sessionid: "abcd1234",
			state: "statevalue",
		};
		const mockCookiesString = Object.entries(mockCookies)
			.map(([k, v]) => `${k}=${v}`)
			.join(", ");

		// Create payload with timestamp (new format)
		const payload = {
			cookies: mockCookiesString,
			timestamp: Date.now(),
		};

		const encryptedPayload = await symmetricEncrypt({
			key: secret,
			data: JSON.stringify(payload),
		});

		await client.$fetch(
			`/oauth-proxy-callback?callbackURL=%2Fdashboard&cookies=${encryptedPayload}`,
			{
				onError(context) {
					const headersList = [...context.response.headers];
					const parsedCookies: Record<string, string> = {};
					for (const [key, value] of headersList) {
						if (key.toLowerCase() === "set-cookie") {
							const [cookiePair] = value.split(";");
							if (!cookiePair) continue;
							const [cookieKey, cookieValue] = cookiePair.split("=");
							if (cookieKey === undefined || cookieValue === undefined)
								continue;
							parsedCookies[cookieKey] = cookieValue;
						}
					}
					expect(mockCookies).toEqual(parsedCookies);
				},
			},
		);
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

						// Should redirect to proxy callback
						expect(location).toContain("/oauth-proxy-callback");
						expect(location).toContain("callbackURL");
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
			const { symmetricDecrypt } = await import("../../crypto");
			const { parseJSON } = await import("../../client/parser");

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

	describe("payload timestamp", () => {
		it("should include timestamp in encrypted payload", async () => {
			const { client, auth } = await getTestInstance({
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

			const payload = {
				cookies: "sessionid=abcd1234; state=statevalue",
				timestamp: Date.now(),
			};

			const encryptedCookies = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload),
			});

			let requestSucceeded = false;
			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&cookies=${encryptedCookies}`,
				{
					onError(context) {
						if (context.response.status === 302) {
							const location = context.response.headers.get("location");
							expect(location).toContain("/dashboard");
							requestSucceeded = true;
						}
					},
				},
			);
			expect(requestSucceeded).toBe(true);
		});

		it("should reject expired payloads", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
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

			// Create payload with expired timestamp (2 minutes ago)
			const payload = {
				cookies: "sessionid=abcd1234; state=statevalue",
				timestamp: Date.now() - 120000, // 2 minutes ago
			};

			const encryptedCookies = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&cookies=${encryptedCookies}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error");
						expect(location).toContain("expired or invalid");
					},
				},
			);
		});

		it("should reject payloads with future timestamps", async () => {
			const { client, auth } = await getTestInstance({
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

			// Create payload with future timestamp
			const payload = {
				cookies: "sessionid=abcd1234; state=statevalue",
				timestamp: Date.now() + 120000, // 2 minutes in the future
			};

			const encryptedCookies = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&cookies=${encryptedCookies}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error");
						expect(location).toContain("expired or invalid");
					},
				},
			);
		});

		it("should reject malformed payload missing timestamp", async () => {
			const { client, auth } = await getTestInstance({
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

			// Create payload missing required timestamp field
			const malformedPayload = {
				cookies: "sessionid=abcd1234",
				// missing timestamp
			};

			const encryptedCookies = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(malformedPayload),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&cookies=${encryptedCookies}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error");
					},
				},
			);
		});

		it("should allow multiple requests within time window", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
						maxAge: 60,
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

			// First request
			const payload1 = {
				cookies: "sessionid=first; state=state1",
				timestamp: Date.now(),
			};

			const encryptedCookies1 = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload1),
			});

			let firstSucceeded = false;
			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&cookies=${encryptedCookies1}`,
				{
					onError(context) {
						if (context.response.status === 302) {
							const location = context.response.headers.get("location");
							expect(location).toContain("/dashboard");
							firstSucceeded = true;
						}
					},
				},
			);
			expect(firstSucceeded).toBe(true);

			// Second request should also succeed
			const payload2 = {
				cookies: "sessionid=second; state=state2",
				timestamp: Date.now(),
			};

			const encryptedCookies2 = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload2),
			});

			let secondSucceeded = false;
			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&cookies=${encryptedCookies2}`,
				{
					onError(context) {
						if (context.response.status === 302) {
							const location = context.response.headers.get("location");
							expect(location).toContain("/dashboard");
							secondSucceeded = true;
						}
					},
				},
			);
			expect(secondSucceeded).toBe(true);
		});

		it("should use custom maxAge setting", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview-localhost:3000",
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
				cookies: "sessionid=abcd1234",
				timestamp: Date.now() - 10000, // 10 seconds ago
			};

			const encryptedCookies = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload),
			});

			await client.$fetch(
				`/oauth-proxy-callback?callbackURL=%2Fdashboard&cookies=${encryptedCookies}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("error");
						expect(location).toContain("expired or invalid");
					},
				},
			);
		});
	});

	describe("replicateData", () => {
		it("should include replicationData in payload when enabled", async () => {
			// Use currentURL to simulate preview environment making request to production
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
						replicateData: true,
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
			const { symmetricDecrypt } = await import("../../crypto");
			const { parseJSON } = await import("../../client/parser");

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

			let encryptedCookies: string | null = null;
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				onError(context) {
					const location = context.response.headers.get("location");
					if (location && location.includes("cookies=")) {
						const url = new URL(location);
						encryptedCookies = url.searchParams.get("cookies");
					}
				},
			});

			expect(encryptedCookies).toBeTruthy();

			// Decrypt and verify replicationData is present
			const decrypted = await symmetricDecrypt({
				key: secret,
				data: encryptedCookies!,
			});
			const payload = parseJSON<{
				cookies: string;
				timestamp: number;
				replicationData?: {
					user: unknown;
					session: unknown;
					account: unknown;
				};
			}>(decrypted);

			expect(payload.replicationData).toBeDefined();
			expect(payload.replicationData?.user).toBeDefined();
			expect(payload.replicationData?.session).toBeDefined();
			expect(payload.replicationData?.account).toBeDefined();
		});

		it("should replicate session data to separate database", async () => {
			// Production instance - handles OAuth callback
			const production = await getTestInstance(
				{
					plugins: [
						oAuthProxy({
							currentURL: "http://preview.example.com",
							replicateData: true,
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
					plugins: [
						oAuthProxy({
							replicateData: true,
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

			const { secret } = await production.auth.$context;
			const { symmetricDecrypt } = await import("../../crypto");
			const { parseJSON } = await import("../../client/parser");

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
			let encryptedCookies: string | null = null;
			let callbackURL: string | null = null;
			await production.client.$fetch(
				`/callback/google?code=test&state=${state}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						if (location && location.includes("cookies=")) {
							const url = new URL(location);
							encryptedCookies = url.searchParams.get("cookies");
							callbackURL = url.searchParams.get("callbackURL");
						}
					},
				},
			);

			expect(encryptedCookies).toBeTruthy();

			// Verify user was created in production DB
			const productionCtx = await production.auth.$context;
			const productionUsers = await productionCtx.internalAdapter.listUsers();
			expect(productionUsers.length).toBe(1);
			expect(productionUsers[0]?.email).toBe("user@email.com");

			// Verify preview DB is empty before replication
			const previewCtx = await preview.auth.$context;
			const previewUsersBefore = await previewCtx.internalAdapter.listUsers();
			expect(previewUsersBefore.length).toBe(0);

			// Step 3: Call oauth-proxy-callback on preview instance
			const decrypted = await symmetricDecrypt({
				key: secret,
				data: encryptedCookies!,
			});
			const payload = parseJSON<{
				cookies: string;
				timestamp: number;
				replicationData?: unknown;
			}>(decrypted);

			// Re-encrypt for preview (using same secret for test)
			const previewSecret = (await preview.auth.$context).secret;
			const reEncrypted = await symmetricEncrypt({
				key: previewSecret,
				data: JSON.stringify(payload),
			});

			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=${encodeURIComponent(callbackURL!)}&cookies=${encodeURIComponent(reEncrypted)}`,
				{
					onError(context) {
						const location = context.response.headers.get("location");
						expect(location).toContain("/dashboard");
					},
				},
			);

			// Step 4: Verify data was replicated to preview DB
			const previewUsersAfter = await previewCtx.internalAdapter.listUsers();
			expect(previewUsersAfter.length).toBe(1);
			expect(previewUsersAfter[0]?.email).toBe("user@email.com");

			// Verify account was replicated
			const previewAccounts = await previewCtx.internalAdapter.findAccounts(
				previewUsersAfter[0]!.id,
			);
			expect(previewAccounts.length).toBe(1);
			expect(previewAccounts[0]?.providerId).toBe("google");

			// Verify session was replicated
			const previewSessions = await previewCtx.internalAdapter.listSessions(
				previewUsersAfter[0]!.id,
			);
			expect(previewSessions.length).toBe(1);
		});

		it("should not include replicationData when disabled", async () => {
			const { client, auth } = await getTestInstance({
				plugins: [
					oAuthProxy({
						currentURL: "http://preview.example.com",
						// replicateData is not set (default false)
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
			const { symmetricDecrypt } = await import("../../crypto");
			const { parseJSON } = await import("../../client/parser");

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

			let encryptedCookies: string | null = null;
			await client.$fetch(`/callback/google?code=test&state=${state}`, {
				onError(context) {
					const location = context.response.headers.get("location");
					if (location && location.includes("cookies=")) {
						const url = new URL(location);
						encryptedCookies = url.searchParams.get("cookies");
					}
				},
			});

			expect(encryptedCookies).toBeTruthy();

			// Decrypt and verify replicationData is NOT present
			const decrypted = await symmetricDecrypt({
				key: secret,
				data: encryptedCookies!,
			});
			const payload = parseJSON<{
				cookies: string;
				timestamp: number;
				replicationData?: unknown;
			}>(decrypted);

			expect(payload.replicationData).toBeUndefined();
		});

		it("should skip user creation if user already exists", async () => {
			// Create preview instance
			const preview = await getTestInstance(
				{
					baseURL: "http://preview.example.com",
					plugins: [
						oAuthProxy({
							replicateData: true,
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

			const previewCtx = await preview.auth.$context;
			const { secret } = previewCtx;

			// Pre-create user in preview DB
			const existingUser = await previewCtx.internalAdapter.createUser({
				id: "existing-user-id",
				email: "existing@email.com",
				name: "Existing User",
				emailVerified: true,
			});

			// Create payload with replicationData for the SAME user id
			const payload = {
				cookies: "session_token=test123",
				timestamp: Date.now(),
				replicationData: {
					user: {
						id: existingUser.id,
						email: "existing@email.com",
						name: "New Name", // Different name
						emailVerified: true,
					},
					session: {
						id: "session-id",
						userId: existingUser.id,
						token: "test123",
						expiresAt: new Date(Date.now() + 86400000).toISOString(),
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
					account: {
						id: "account-id",
						userId: existingUser.id,
						accountId: "google-account-id",
						providerId: "google",
					},
				},
			};

			const encrypted = await symmetricEncrypt({
				key: secret,
				data: JSON.stringify(payload),
			});

			await preview.client.$fetch(
				`/oauth-proxy-callback?callbackURL=/dashboard&cookies=${encodeURIComponent(encrypted)}`,
				{
					onError(context) {
						expect(context.response.status).toBe(302);
					},
				},
			);

			// User should still have original name (not overwritten)
			const users = await previewCtx.internalAdapter.listUsers();
			expect(users.length).toBe(1);
			expect(users[0]?.name).toBe("Existing User");
		});
	});
});
