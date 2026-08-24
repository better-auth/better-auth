import { createAuthEndpoint } from "@better-auth/core/api";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { originCheck } from "./origin-check";

describe("Origin Check", async () => {
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

	it("should reject untrusted origin even without cookies", async (ctx) => {
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
		expect(res.error?.status).toBe(403);
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

	it("should filter out null values from trustedOrigins callback", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: false,
				disableOriginCheck: false,
			},
			trustedOrigins: async (request) => {
				if (!request) return [];
				// Simulate a scenario where some dynamic origins might be null
				const dynamicOrigins = [
					"http://valid-origin.com",
					request.headers.get("x-custom-origin"), // Could be null
					request.headers.get("x-another-origin"), // Could be null
				];
				return dynamicOrigins as string[];
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://valid-origin.com",
				},
			},
		});

		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});

		// Should succeed because valid-origin.com is in the list and null values are filtered out
		expect(res.data?.user).toBeDefined();
	});
});

describe("Fetch Metadata CSRF Protection", async () => {
	const { testUser, auth } = await getTestInstance({
		trustedOrigins: ["http://localhost:3000", "https://app.example.com"],
		emailAndPassword: {
			enabled: true,
		},
		advanced: {
			disableCSRFCheck: false,
			disableOriginCheck: false,
		},
	});

	it("should block cross-site navigation on first-login (no session cookie)", async (ctx) => {
		const maliciousRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "https://evil.com",
				},
				body: JSON.stringify({
					email: "attacker@evil.com",
					password: "password123",
				}),
			},
		);

		const response = await auth.handler(maliciousRequest);
		expect(response.status).toBe(403);
		const error = await response.json();
		expect(error.message).toBe(
			"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
		);
	});

	it("should allow same-origin navigation on first-login (no session cookie)", async (ctx) => {
		const legitimateRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "same-origin",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(legitimateRequest);

		expect(response.status).not.toBe(403);
		const error = await response.json().catch(() => null);
		if (error?.message) {
			expect(error.message).not.toBe(
				"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
			);
		}
	});

	it("should allow same-site navigation on first-login (no session cookie)", async (ctx) => {
		const legitimateRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "same-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "https://app.example.com",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(legitimateRequest);

		expect(response.status).not.toBe(403);
		const error = await response.json().catch(() => null);
		if (error?.message) {
			expect(error.message).not.toBe(
				"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
			);
		}
	});

	it("should fallback to origin validation when Fetch Metadata is missing", async (ctx) => {
		const requestWithoutMetadata = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(requestWithoutMetadata);

		expect(response.status).not.toBe(403);
	});

	it("should reject an untrusted origin on first-login when Fetch Metadata is missing", async (ctx) => {
		const crossOriginRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "https://evil.com",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(crossOriginRequest);

		expect(response.status).toBe(403);
	});

	it("should reject an untrusted Referer on first-login when Fetch Metadata is missing", async (ctx) => {
		const crossRefererRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					referer: "https://evil.com",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(crossRefererRequest);

		expect(response.status).toBe(403);
	});

	it("should allow a first-login request that sends no cookies, Fetch Metadata, or origin", async (ctx) => {
		const nonBrowserRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(nonBrowserRequest);

		expect(response.status).not.toBe(403);
	});

	it("should use existing origin validation when session cookie exists", async (ctx) => {
		const signInResponse = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});

		const setCookieHeader = signInResponse.headers.get("set-cookie");
		const cookies = parseSetCookieHeader(setCookieHeader || "");
		const sessionCookie = cookies.get("better-auth.session_token");
		if (!sessionCookie) {
			throw new Error("Failed to get session cookie");
		}

		const requestWithSession = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: `better-auth.session_token=${sessionCookie.value}`,
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(requestWithSession);

		expect(response.status).not.toBe(403);
	});

	it("should block cross-site navigation for sign-up endpoint", async (ctx) => {
		const maliciousRequest = new Request(
			"http://localhost:3000/api/auth/sign-up/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "https://evil.com",
				},
				body: JSON.stringify({
					email: "attacker@evil.com",
					password: "password123",
					name: "Attacker",
				}),
			},
		);

		const response = await auth.handler(maliciousRequest);
		expect(response.status).toBe(403);
		const error = await response.json();
		expect(error.message).toBe(
			"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
		);
	});

	it("should allow cors mode requests (fetch/XHR)", async (ctx) => {
		const fetchRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "same-origin",
					"Sec-Fetch-Mode": "cors",
					"Sec-Fetch-Dest": "empty",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(fetchRequest);

		expect(response.status).not.toBe(403);
		const error = await response.json().catch(() => null);
		if (error?.message) {
			expect(error.message).not.toBe(
				"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
			);
		}
	});

	it("should allow requests with expired session cookie (cookie presence check)", async (ctx) => {
		const requestWithExpiredCookie = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: "better-auth.session_token=expired_or_invalid_token",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(requestWithExpiredCookie);

		expect(response.status).not.toBe(403);
		const error = await response.json().catch(() => null);
		if (error?.message) {
			expect(error.message).not.toBe(
				"Cross-site navigation login blocked. This request appears to be a CSRF attack.",
			);
		}
	});
});

describe("origin check middleware", async () => {
	it("should return invalid origin", async () => {
		const { client } = await getTestInstance({
			trustedOrigins: ["https://trusted-site.com"],
			advanced: {
				disableOriginCheck: false,
			},
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

	it("should skip origin check for matched paths when skipOriginCheck is set to an array", async () => {
		const { client } = await getTestInstance({
			trustedOrigins: ["https://trusted-site.com"],
			advanced: {
				disableOriginCheck: false,
			},
			plugins: [
				{
					id: "test",
					init() {
						return {
							context: {
								skipOriginCheck: ["/public/data"],
							},
						};
					},
					endpoints: {
						publicEndpoint: createAuthEndpoint(
							"/public/data",
							{
								method: "GET",
								query: z.object({
									callbackURL: z.string(),
								}),
								use: [originCheck((c) => c.query.callbackURL)],
							},
							async (c) => c.query.callbackURL,
						),
						protectedEndpoint: createAuthEndpoint(
							"/protected/data",
							{
								method: "GET",
								query: z.object({
									callbackURL: z.string(),
								}),
								use: [originCheck((c) => c.query.callbackURL)],
							},
							async (c) => c.query.callbackURL,
						),
					},
				},
			],
		});

		const skipped = await client.$fetch(
			"/public/data?callbackURL=https://malicious.com",
		);
		expect(skipped.data).toBe("https://malicious.com");

		const blocked = await client.$fetch(
			"/protected/data?callbackURL=https://malicious.com",
		);
		expect(blocked.error?.status).toBe(403);
	});

	it("should not skip origin check for a path that only shares a prefix with a skip path", async () => {
		const { client } = await getTestInstance({
			trustedOrigins: ["https://trusted-site.com"],
			advanced: {
				disableOriginCheck: false,
			},
			plugins: [
				{
					id: "test",
					init() {
						return {
							context: {
								skipOriginCheck: ["/public/data"],
							},
						};
					},
					endpoints: {
						siblingEndpoint: createAuthEndpoint(
							"/public/database",
							{
								method: "GET",
								query: z.object({
									callbackURL: z.string(),
								}),
								use: [originCheck((c) => c.query.callbackURL)],
							},
							async (c) => c.query.callbackURL,
						),
					},
				},
			],
		});

		// "/public/database" only shares a prefix with the configured skip path
		// "/public/data"; it must still have its callbackURL validated.
		const blocked = await client.$fetch(
			"/public/database?callbackURL=https://malicious.com",
		);
		expect(blocked.error?.status).toBe(403);
	});

	it("should reject a non-string redirect parameter with 400, not 500", async () => {
		const { auth } = await getTestInstance({
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: false,
				disableOriginCheck: false,
			},
		});

		// An object callbackURL reaches the global origin-check middleware before
		// endpoint schema validation; it must produce a controlled 400.
		const objectBodyRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: "test@test.com",
					password: "password12345",
					callbackURL: { object: true },
				}),
			},
		);
		const objectRes = await auth.handler(objectBodyRequest);
		expect(objectRes.status).toBe(400);

		// Duplicate query callbackURL parameters arrive as an array.
		const duplicateQueryRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email?callbackURL=/a&callbackURL=/b",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({
					email: "test@test.com",
					password: "password12345",
				}),
			},
		);
		const arrayRes = await auth.handler(duplicateQueryRequest);
		expect(arrayRes.status).toBe(400);
	});
});

describe("trusted origins with baseURL inferred from request", async () => {
	it("should respect trustedOrigins array when baseURL is NOT in config", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			baseURL: undefined,
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

		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "http://my-frontend.com/dashboard",
		});

		expect(res.data?.user).toBeDefined();
	});

	it("should reject untrusted origins even when baseURL is inferred", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			baseURL: undefined,
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
					origin: "http://evil-site.com",
					cookie: "session=test",
				},
			},
		});

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
				baseURL: undefined,
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
		const { customFetchImpl, testUser } = await getTestInstance({
			baseURL: undefined,
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
					origin: "http://localhost:3000",
					cookie: "session=test",
				},
			},
		});

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
				baseURL: undefined,
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

			const res1 = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				callbackURL: "http://config-origin.com/dashboard",
			});
			expect(res1.data?.user).toBeDefined();

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

describe("disableCSRFCheck and disableOriginCheck separation", async () => {
	it("disableCSRFCheck should allow untrusted origins with cookies (CSRF bypass)", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: true,
				disableOriginCheck: false,
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://evil-site.com",
					cookie: "session=test",
				},
			},
		});

		// Should succeed because CSRF check is disabled (origin header not validated)
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			// But callbackURL should still be validated by origin check
			callbackURL: "http://localhost:3000/dashboard",
		});

		expect(res.data?.user).toBeDefined();
	});

	it("disableCSRFCheck should still validate callbackURL (origin check still active)", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: true,
				disableOriginCheck: false,
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://evil-site.com",
					cookie: "session=test",
				},
			},
		});

		// Origin header passes (CSRF disabled), but callbackURL should fail
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "http://malicious-site.com/steal",
		});

		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Invalid callbackURL");
	});

	it("disableOriginCheck should allow untrusted callbackURL", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: false,
				disableOriginCheck: true,
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://localhost:3000",
					cookie: "session=test",
				},
			},
		});

		// Origin header is trusted, and callbackURL validation is disabled
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "http://any-site.com/redirect",
		});

		expect(res.data?.user).toBeDefined();
	});

	it("disableOriginCheck also disables CSRF for backward compatibility", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableOriginCheck: true,
			},
		});

		const warnFn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://evil-site.com",
					cookie: "session=test",
				},
			},
		});

		expect(warnFn).toHaveBeenCalledTimes(0);
		// disableOriginCheck: true also disables CSRF for backward compatibility
		// so this should succeed even with an untrusted origin
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "http://any-site.com/redirect",
		});
		expect(warnFn).toHaveBeenCalledTimes(1);

		expect(warnFn).toHaveBeenCalledWith(
			expect.stringMatching(/^\[Deprecation]/),
		);

		expect(res.data?.user).toBeDefined();
		{
			await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				callbackURL: "http://any-site.com/redirect",
			});
			expect(warnFn).toHaveBeenCalledTimes(1);
		}
	});

	it("disableCSRFCheck should bypass Fetch Metadata CSRF protection", async () => {
		const { auth, testUser } = await getTestInstance({
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: true,
				disableOriginCheck: false,
			},
		});

		// Cross-site navigation that would normally be blocked
		const maliciousRequest = new Request(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"Sec-Fetch-Site": "cross-site",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Dest": "document",
					origin: "https://evil.com",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);

		const response = await auth.handler(maliciousRequest);
		// Should NOT be blocked because CSRF check is disabled
		expect(response.status).not.toBe(403);
	});

	it("both flags disabled should bypass all checks", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			trustedOrigins: ["http://localhost:3000"],
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				disableCSRFCheck: true,
				disableOriginCheck: true,
			},
		});

		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://evil-site.com",
					cookie: "session=test",
				},
			},
		});

		// Both CSRF and origin checks are disabled
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "http://malicious-site.com/steal",
		});

		expect(res.data?.user).toBeDefined();
	});
});

describe("request-scoped trusted origin isolation", async () => {
	it("does not let one request's trusted origins bleed into a concurrent request", async () => {
		let releaseA!: () => void;
		const aPaused = new Promise<void>((resolve) => {
			releaseA = resolve;
		});
		let signalAtPause!: () => void;
		const aReachedPause = new Promise<void>((resolve) => {
			signalAtPause = resolve;
		});

		const { auth } = await getTestInstance({
			baseURL: "http://localhost:3000",
			emailAndPassword: { enabled: true },
			advanced: { disableCSRFCheck: false, disableOriginCheck: false },
			trustedOrigins: (request) =>
				request?.headers.get("x-tenant") === "a"
					? ["https://a.example"]
					: ["https://b.example"],
			plugins: [
				{
					id: "pause-tenant-a",
					onRequest: async (request) => {
						if (request.headers.get("x-tenant") === "a") {
							signalAtPause();
							await aPaused;
						}
						return undefined;
					},
				},
			],
		});

		const makeRequest = (tenant: "a" | "b") =>
			new Request("http://localhost:3000/api/auth/sign-in/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-tenant": tenant,
					// Tenant A carries tenant B's origin: only the shared-context
					// bleed would let A trust it.
					origin: "https://b.example",
					cookie: "x=1",
				},
				body: JSON.stringify({
					email: `${tenant}@example.com`,
					password: "password1234",
				}),
			});

		// Start A; it pauses inside onRequest after base.ts resolved A's origins.
		const aResponsePromise = auth.handler(makeRequest("a"));
		await aReachedPause;
		// Run B to completion so it mutates any shared trust state.
		await auth.handler(makeRequest("b"));
		releaseA();

		const aResponse = await aResponsePromise;
		// A must reject tenant B's origin; b.example is not in A's trusted list.
		expect(aResponse.status).toBe(403);
	});
});

describe("inferred baseURL is not persisted across requests", async () => {
	it("does not reuse one request's host for a later request's token links", async () => {
		const resetURLs: string[] = [];
		const { auth, testUser } = await getTestInstance({
			baseURL: undefined,
			emailAndPassword: {
				enabled: true,
				sendResetPassword: async ({ url }) => {
					resetURLs.push(url);
				},
			},
		});

		// First request arrives from one host.
		await auth.handler(
			new Request("https://untrusted.example/api/auth/request-password-reset", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: testUser.email, redirectTo: "/" }),
			}),
		);

		// A later request from the legitimate host must build its link from its
		// own host, not the host carried by the first request.
		await auth.handler(
			new Request("https://app.example/api/auth/request-password-reset", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ email: testUser.email, redirectTo: "/" }),
			}),
		);

		const legitURL = resetURLs.at(-1);
		expect(legitURL).toBeDefined();
		expect(legitURL).toContain("https://app.example");
		expect(legitURL).not.toContain("untrusted.example");
	});
});
