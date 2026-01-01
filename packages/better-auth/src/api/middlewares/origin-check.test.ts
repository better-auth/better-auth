import { createAuthEndpoint } from "@better-auth/core/api";
import { describe, expect, vi } from "vitest";
import * as z from "zod";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
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

describe("Fetch Metadata CSRF Protection", async (it) => {
	const { customFetchImpl, testUser, auth, signInWithTestUser } =
		await getTestInstance({
			trustedOrigins: ["http://localhost:3000", "https://app.example.com"],
			emailAndPassword: {
				enabled: true,
				async sendResetPassword(url, user) {},
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

describe("trusted origins with baseURL inferred from request", async (it) => {
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
