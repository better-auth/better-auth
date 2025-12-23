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

describe("trusted origins with baseURL inferred from request", async (it) => {
	it("should respect trustedOrigins array when baseURL is NOT in config", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
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

describe("API Client Support (Non-browser requests)", async (it) => {
	const { customFetchImpl, testUser, auth } = await getTestInstance({
		trustedOrigins: ["http://localhost:3000"],
		emailAndPassword: {
			enabled: true,
			async sendResetPassword(url, user) {},
		},
		advanced: {
			disableCSRFCheck: false,
			disableOriginCheck: false,
		},
	});

	it("should allow non-simple requests without Origin header (API clients like Postman)", async () => {
		const signInRes = await customFetchImpl(
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
		expect(signInRes.ok).toBe(true);
		const sessionCookie = signInRes.headers.get("set-cookie");

		const signOutRes = await customFetchImpl(
			"http://localhost:3000/api/auth/sign-out",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: sessionCookie || "",
				},
				body: JSON.stringify({}),
			},
		);
		expect(signOutRes.ok).toBe(true);
	});

	it("should allow non-simple requests with cookies and no Origin header", async () => {
		const signInRes = await customFetchImpl(
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
		const sessionCookie = signInRes.headers.get("set-cookie");

		const secondSignInRes = await customFetchImpl(
			"http://localhost:3000/api/auth/sign-in/email",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: sessionCookie || "",
				},
				body: JSON.stringify({
					email: testUser.email,
					password: testUser.password,
				}),
			},
		);
		expect(secondSignInRes.ok).toBe(true);
	});

	it("should still validate Origin if provided in non-simple requests", async () => {
		const signInRes = await customFetchImpl(
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
		const sessionCookie = signInRes.headers.get("set-cookie");

		const badOriginRes = await customFetchImpl(
			"http://localhost:3000/api/auth/sign-out",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://malicious.com",
					cookie: sessionCookie || "",
				},
				body: JSON.stringify({}),
			},
		);
		expect(badOriginRes.status).toBe(403);
	});
});
