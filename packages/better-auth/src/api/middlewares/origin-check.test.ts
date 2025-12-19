import { createAuthEndpoint } from "@better-auth/core/api";
import { describe, expect, vi } from "vitest";
import * as z from "zod";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { originCheck } from "./origin-check";

describe("Origin Check", async (it) => {
	const { customFetchImpl, testUser } = await getTestInstance({
		trustedOrigins: [
			"http://localhost:5000",
			"https://trusted.com",
			"*.my-site.com",
		],
		emailAndPassword: {
			enabled: true,
			async sendResetPassword(url, user) {},
		},
		advanced: {
			disableCSRFCheck: false,
			disableOriginCheck: false,
		},
	});

	it("should allow trusted origins", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://localhost:3000",
				},
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "http://localhost:3000/callback",
		});
		expect(res.data?.user).toBeDefined();
	});

	it("should not allow untrusted origins", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const res = await client.signIn.email({
			email: "test@test.com",
			password: "password",
			callbackURL: "http://malicious.com",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Invalid callbackURL");
	});

	it("should reject untrusted origin headers", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "malicious.com",
					cookie: "session=123",
				},
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(res.error?.status).toBe(403);
	});

	it("should allow untrusted origin if they don't contain cookies", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://sub-domain.trusted.com",
				},
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(res.data?.user).toBeDefined();
	});

	it("should reject untrusted redirectTo", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const res = await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "http://malicious.com",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Invalid redirectURL");
	});

	it("should work with list of trusted origins", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://trusted.com",
				},
			},
		});
		const res = await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "http://localhost:5000/reset-password",
		});
		expect(res.data?.status).toBeTruthy();

		const res2 = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				query: {
					currentURL: "http://localhost:5000",
				},
			},
		});
		expect(res2.data?.user).toBeDefined();
	});

	it("should work with wildcard trusted origins", async (ctx) => {
		const client = createAuthClient({
			baseURL: "https://sub-domain.my-site.com",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://sub-domain.my-site.com",
				},
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "https://sub-domain.my-site.com/callback",
		});
		expect(res.data?.user).toBeDefined();
	});

	it("should work with GET requests", async (ctx) => {
		const client = createAuthClient({
			baseURL: "https://sub-domain.my-site.com",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://google.com",
					cookie: "value",
				},
			},
		});
		const res = await client.$fetch("/ok");
		expect(res.data).toMatchObject({ ok: true });
	});

	it("should handle POST requests with proper origin validation", async (ctx) => {
		// Test with valid origin
		const validClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://localhost:5000",
					cookie: "session=123",
				},
			},
		});
		const validRes = await validClient.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(validRes.data?.user).toBeDefined();

		// Test with invalid origin
		const invalidClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://untrusted-domain.com",
					cookie: "session=123",
				},
			},
		});
		const invalidRes = await invalidClient.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(invalidRes.error?.status).toBe(403);
	});
});

describe("origin check middleware", async (it) => {
	it("should return invalid origin", async () => {
		const { client } = await getTestInstance({
			trustedOrigins: ["https://trusted-site.com"],
			plugins: [
				{
					id: "test",
					endpoints: {
						test: createAuthEndpoint(
							"/test",
							{
								method: "GET",
								query: z.object({
									callbackURL: z.string(),
								}),
								use: [originCheck((c) => c.query.callbackURL)],
							},
							async (c) => {
								return c.query.callbackURL;
							},
						),
					},
				},
			],
		});
		const invalid = await client.$fetch(
			"/test?callbackURL=https://malicious-site.com",
		);
		expect(invalid.error?.status).toBe(403);
		const valid = await client.$fetch("/test?callbackURL=/dashboard");
		expect(valid.data).toBe("/dashboard");
		const validTrusted = await client.$fetch(
			"/test?callbackURL=https://trusted-site.com/path",
		);
		expect(validTrusted.data).toBe("https://trusted-site.com/path");

		const sampleInternalEndpointInvalid = await client.$fetch(
			"/verify-email?callbackURL=https://malicious-site.com&token=xyz",
		);
		expect(sampleInternalEndpointInvalid.error?.status).toBe(403);
	});
});

/**
 * Regression tests for trustedOrigins when baseURL is NOT provided in config.
 *
 * Issue: https://github.com/better-auth/better-auth/issues/6798
 *
 * When baseURL is not in the auth config, it gets inferred from the first request.
 * However, getTrustedOrigins() is called at init time BEFORE the first request,
 * so it returns [] (empty array) because it can't determine the baseURL yet.
 *
 * This caused trustedOrigins from config (array or env var) to be ignored,
 * resulting in "Invalid origin" errors even for properly configured origins.
 *
 * The fix rebuilds trustedOrigins when baseURL is inferred from the request,
 * ensuring all configured origins are respected.
 */
describe("trustedOrigins regression tests (baseURL inferred from request)", async (it) => {
	it("should respect trustedOrigins array when baseURL is NOT in config", async () => {
		// NOTE: We intentionally do NOT pass baseURL to the auth config.
		// This simulates the common SvelteKit/Next.js setup where baseURL
		// is inferred from the incoming request.
		const { customFetchImpl, testUser } = await getTestInstance({
			// baseURL is NOT set - will be inferred from request
			trustedOrigins: ["http://my-frontend.com"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: false,
				disableOriginCheck: false,
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://my-frontend.com",
					cookie: "session=test",
				},
			},
		});

		// This should succeed because http://my-frontend.com is in trustedOrigins
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "http://my-frontend.com/dashboard",
		});

		expect(res.data?.user).toBeDefined();
	});

	it("should reject untrusted origins even when baseURL is inferred", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			// baseURL is NOT set - will be inferred from request
			trustedOrigins: ["http://my-frontend.com"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: false,
				disableOriginCheck: false,
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://evil-site.com", // NOT in trustedOrigins
					cookie: "session=test",
				},
			},
		});

		// This should fail because http://evil-site.com is NOT in trustedOrigins
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});

		expect(res.error?.status).toBe(403);
	});

	it("should respect BETTER_AUTH_TRUSTED_ORIGINS env when baseURL is NOT in config", async () => {
		vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://env-frontend.com");

		try {
			const { customFetchImpl, testUser } = await getTestInstance({
				// baseURL is NOT set - will be inferred from request
				// trustedOrigins is NOT set - should come from env var
				emailAndPassword: {
					enabled: true,
				},
				advanced: {
					disableCSRFCheck: false,
					disableOriginCheck: false,
				},
			});

			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl,
					headers: {
						origin: "http://env-frontend.com",
						cookie: "session=test",
					},
				},
			});

			// This should succeed because http://env-frontend.com is in BETTER_AUTH_TRUSTED_ORIGINS
			const res = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				callbackURL: "http://env-frontend.com/dashboard",
			});

			expect(res.data?.user).toBeDefined();
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("should allow requests from inferred baseURL origin", async () => {
		// When baseURL is inferred, it should automatically be trusted
		const { customFetchImpl, testUser } = await getTestInstance({
			// baseURL is NOT set - will be inferred as http://localhost:3000
			// trustedOrigins is NOT set
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: false,
				disableOriginCheck: false,
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://localhost:3000", // Same as inferred baseURL
					cookie: "session=test",
				},
			},
		});

		// This should succeed because the origin matches the inferred baseURL
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "http://localhost:3000/dashboard",
		});

		expect(res.data?.user).toBeDefined();
	});

	it("should support both config array and env var together when baseURL is inferred", async () => {
		vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://env-origin.com");

		try {
			const { customFetchImpl, testUser } = await getTestInstance({
				// baseURL is NOT set - will be inferred from request
				trustedOrigins: ["http://config-origin.com"],
				emailAndPassword: {
					enabled: true,
				},
				advanced: {
					disableCSRFCheck: false,
					disableOriginCheck: false,
				},
			});

			const client = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl,
					headers: {
						origin: "http://config-origin.com",
						cookie: "session=test",
					},
				},
			});

			// Config origin should work
			const res1 = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				callbackURL: "http://config-origin.com/dashboard",
			});
			expect(res1.data?.user).toBeDefined();

			// Env origin should also work
			const client2 = createAuthClient({
				baseURL: "http://localhost:3000",
				fetchOptions: {
					customFetchImpl,
					headers: {
						origin: "http://env-origin.com",
						cookie: "session=test",
					},
				},
			});

			const res2 = await client2.signIn.email({
				email: testUser.email,
				password: testUser.password,
				callbackURL: "http://env-origin.com/dashboard",
			});
			expect(res2.data?.user).toBeDefined();
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
