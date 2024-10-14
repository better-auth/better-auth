import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";

describe("redirectURLMiddleware", async (it) => {
	const { customFetchImpl, testUser } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
			async sendResetPassword(url, user) {},
		},
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
		expect(res.error?.message).toBe("Invalid callback URL");
	});

	it("should allow trusted origins", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			callbackURL: "http://localhost:3000/callback",
		});
		expect(res.data?.session).toBeDefined();
	});

	it("shouldn't allow untrusted currentURL", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				headers: {
					referer: "http://malicious.com",
				},
			},
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Invalid callback URL");

		const res2 = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				// @ts-expect-error - query is not defined in the type
				query: {
					currentURL: "http://malicious.com",
				},
			},
		});
		expect(res2.error?.status).toBe(403);
		expect(res2.error?.message).toBe("Invalid callback URL");
	});

	it("shouldn't allow untrusted redirectTo", async (ctx) => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const res = await client.forgetPassword({
			email: testUser.email,
			redirectTo: "http://malicious.com",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Invalid callback URL");
	});
});
