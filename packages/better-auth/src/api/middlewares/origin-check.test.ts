import { createAuthEndpoint } from "@better-auth/core/api";
import { describe, expect } from "vitest";
import * as z from "zod";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { isSimpleRequest, originCheck } from "./origin-check";

describe("Origin Check", async (it) => {
	const { customFetchImpl, testUser } = await getTestInstance({
		trustedOrigins: [
			"http://localhost:5000",
			"https://trusted.com",
			"*.my-site.com",
			"https://*.protocol-site.com",
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

	it("should allow query params in callback url", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://localhost:3000",
				},
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "/dashboard?test=123",
		});
		expect(res.data?.user).toBeDefined();
	});

	it("should allow plus signs in the callback url", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://localhost:3000",
				},
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "/dashboard+page?test=123+456",
		});
		expect(res.data?.user).toBeDefined();
	});

	it("should reject callback url with double slash", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://localhost:3000",
				},
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "//evil.com",
		});
		expect(res.error?.status).toBe(403);
	});

	it("should reject callback urls with encoded malicious content", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://localhost:3000",
				},
			},
		});

		const maliciousPatterns = [
			"/%5C/evil.com",
			`/\\/\\/evil.com`,
			"/%5C/evil.com",
			"/..%2F..%2Fevil.com",
			"javascript:alert('xss')",
			"data:text/html,<script>alert('xss')</script>",
		];

		for (const pattern of maliciousPatterns) {
			const res = await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				callbackURL: pattern,
			});
			expect(res.error?.status).toBe(403);
		}
	});

	it("should reject callback url with malicious domain with wildcard trusted origins", async (ctx) => {
		const { customFetchImpl, testUser } = await getTestInstance({
			trustedOrigins: ["*.example.com"],
			emailAndPassword: {
				enabled: true,
				async sendResetPassword(url, user) {},
			},
		});
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					cookie: "session=123",
				},
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "malicious.com?.example.com",
		});
		expect(res.error?.status).toBe(403);
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

	it("should reject untrusted origin headers which start with trusted origin", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://trusted.com.malicious.com",
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

	it("should reject untrusted origin subdomains", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://sub-domain.trusted.com",
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

		// Test another subdomain with the wildcard pattern
		const client2 = createAuthClient({
			baseURL: "https://another-sub.my-site.com",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://another-sub.my-site.com",
				},
			},
		});
		const res2 = await client2.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "https://another-sub.my-site.com/callback",
		});
		expect(res2.data?.user).toBeDefined();
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

	it("should work with relative callbackURL with query params", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "/dashboard?email=123@email.com",
		});
		expect(res.data?.user).toBeDefined();
	});

	it("should work with protocol specific wildcard trusted origins", async () => {
		// Test HTTPS protocol specific wildcard - should work
		const httpsClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "https://api.protocol-site.com",
					cookie: "session=123",
				},
			},
		});
		const httpsRes = await httpsClient.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "https://app.protocol-site.com/dashboard",
		});
		expect(httpsRes.data?.user).toBeDefined();

		// Test HTTP with HTTPS protocol wildcard - should fail
		const httpClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
				headers: {
					origin: "http://api.protocol-site.com",
					cookie: "session=123",
				},
			},
		});
		const httpRes = await httpClient.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(httpRes.error?.status).toBe(403);
	});

	it("should work with custom scheme wildcards (e.g. exp:// for Expo)", async () => {
		const { customFetchImpl, testUser } = await getTestInstance({
			trustedOrigins: [
				"exp://10.0.0.*:*/*",
				"exp://192.168.*.*:*/*",
				"exp://172.*.*.*:*/*",
			],
			emailAndPassword: {
				enabled: true,
				async sendResetPassword(url, user) {},
			},
		});

		// Test custom scheme with wildcard - should work
		const expoClient = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});

		// Test with IP matching the wildcard pattern
		const resWithIP = await expoClient.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "exp://10.0.0.29:8081/--/",
		});
		expect(resWithIP.data?.user).toBeDefined();

		// Test with different IP range that matches
		const resWithIP2 = await expoClient.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "exp://192.168.1.100:8081/--/",
		});
		expect(resWithIP2.data?.user).toBeDefined();

		// Test with different IP range that matches
		const resWithIP3 = await expoClient.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "exp://172.16.0.1:8081/--/",
		});
		expect(resWithIP3.data?.user).toBeDefined();

		// Test with IP that doesn't match any pattern - should fail
		const resWithUnmatchedIP = await expoClient.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "exp://203.0.113.0:8081/--/",
		});
		expect(resWithUnmatchedIP.error?.status).toBe(403);
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

describe("is simple request", async (it) => {
	it("should return true for simple requests", async () => {
		const request = new Request("http://localhost:3000/test", {
			method: "GET",
		});
		const isSimple = isSimpleRequest(request.headers);
		expect(isSimple).toBe(true);
	});

	it("should return false for non-simple requests", async () => {
		const request = new Request("http://localhost:3000/test", {
			method: "POST",
			headers: {
				"custom-header": "value",
			},
		});
		const isSimple = isSimpleRequest(request.headers);
		expect(isSimple).toBe(false);
	});

	it("should return false for requests with a content type that is not simple", async () => {
		const request = new Request("http://localhost:3000/test", {
			method: "POST",
			headers: {
				"content-type": "application/json",
			},
		});
		const isSimple = isSimpleRequest(request.headers);
		expect(isSimple).toBe(false);
	});

	it;
});
