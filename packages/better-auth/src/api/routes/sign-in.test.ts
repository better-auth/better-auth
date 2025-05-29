import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../cookies";
import { createHeadersWithTenantId } from "../../test-utils/headers";

/**
 * More test can be found in `session.test.ts`
 */
describe("sign-in", async (it) => {
	const { auth, testUser, cookieSetter } = await getTestInstance();

	it("should return a response with a set-cookie header", async () => {
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const setCookie = signInRes.headers.get("set-cookie");
		const parsed = parseSetCookieHeader(setCookie || "");
		expect(parsed.get("better-auth.session_token")).toBeDefined();
	});

	it("should read the ip address and user agent from the headers", async () => {
		const headerObj = {
			"X-Forwarded-For": "127.0.0.1",
			"User-Agent": "Test",
		};
		const headers = new Headers(headerObj);
		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
			headers,
		});
		cookieSetter(headers)({
			response: signInRes,
		});
		const session = await auth.api.getSession({
			headers,
		});
		expect(session?.session.ipAddress).toBe(headerObj["X-Forwarded-For"]);
		expect(session?.session.userAgent).toBe(headerObj["User-Agent"]);
	});
});

describe("sign-in with multi-tenancy", async (it) => {
	const { auth } = await getTestInstance(
		{
			multiTenancy: {
				enabled: true,
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should sign in users with correct tenant ID", async () => {
		// Create users in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "user1@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "user2@test.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Sign in both users
		const tenant1SignIn = await auth.api.signInEmail({
			body: {
				email: "user1@test.com",
				password: "password",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2SignIn = await auth.api.signInEmail({
			body: {
				email: "user2@test.com",
				password: "password",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		expect(tenant1SignIn.token).toBeDefined();
		expect(tenant2SignIn.token).toBeDefined();

		// Verify sessions have correct tenant IDs
		const tenant1Session = await auth.api.getSession({
			headers: createHeadersWithTenantId("tenant-1", {
				authorization: `Bearer ${tenant1SignIn.token}`,
			}),
		});

		const tenant2Session = await auth.api.getSession({
			headers: createHeadersWithTenantId("tenant-2", {
				authorization: `Bearer ${tenant2SignIn.token}`,
			}),
		});

		expect(tenant1Session?.user.tenantId).toBe("tenant-1");
		expect(tenant2Session?.user.tenantId).toBe("tenant-2");
	});

	it("should allow same email to sign in to different tenants", async () => {
		const email = "same@test.com";
		const password = "password";

		// Create users with same email in different tenants
		await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: "User in Tenant 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: "User in Tenant 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Sign in both users
		const tenant1SignIn = await auth.api.signInEmail({
			body: {
				email,
				password,
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2SignIn = await auth.api.signInEmail({
			body: {
				email,
				password,
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		expect(tenant1SignIn.token).toBeDefined();
		expect(tenant2SignIn.token).toBeDefined();

		// Verify both sessions exist with correct tenant IDs and different user IDs
		const tenant1Session = await auth.api.getSession({
			headers: createHeadersWithTenantId("tenant-1", {
				authorization: `Bearer ${tenant1SignIn.token}`,
			}),
		});

		const tenant2Session = await auth.api.getSession({
			headers: createHeadersWithTenantId("tenant-2", {
				authorization: `Bearer ${tenant2SignIn.token}`,
			}),
		});

		expect(tenant1Session?.user.email).toBe(email);
		expect(tenant2Session?.user.email).toBe(email);
		expect(tenant1Session?.user.tenantId).toBe("tenant-1");
		expect(tenant2Session?.user.tenantId).toBe("tenant-2");
		expect(tenant1Session?.user.id).not.toBe(tenant2Session?.user.id);
	});

	it("should prevent cross-tenant sign-in", async () => {
		const email = "cross-tenant@test.com";
		const password = "password";

		// Create user in tenant-1
		await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: "User in Tenant 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Try to sign in with tenant-2 header (should fail)
		const crossTenantSignIn = auth.api.signInEmail({
			body: {
				email,
				password,
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		await expect(crossTenantSignIn).rejects.toThrow();
	});

	it("should maintain tenant context in session after sign-in", async () => {
		const email = "context@test.com";
		const password = "password";
		const tenantId = "tenant-context";

		// Create user
		await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: "Context User",
			},
			headers: createHeadersWithTenantId(tenantId),
		});

		// Sign in
		const signInRes = await auth.api.signInEmail({
			body: {
				email,
				password,
			},
			headers: createHeadersWithTenantId(tenantId),
		});

		expect(signInRes.token).toBeDefined();

		// Get session and verify tenant context is maintained
		const session = await auth.api.getSession({
			headers: createHeadersWithTenantId(tenantId, {
				authorization: `Bearer ${signInRes.token}`,
			}),
		});

		expect(session?.user.tenantId).toBe(tenantId);
		expect(session?.user.email).toBe(email);
		expect(session?.session).toBeDefined();
	});

	it("should handle IP address and user agent with tenant context", async () => {
		const email = "ip-test@test.com";
		const password = "password";
		const tenantId = "tenant-ip";

		// Create user
		await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: "IP Test User",
			},
			headers: createHeadersWithTenantId(tenantId),
		});

		// Sign in with specific headers
		const signInRes = await auth.api.signInEmail({
			body: {
				email,
				password,
			},
			headers: createHeadersWithTenantId(tenantId, {
				"X-Forwarded-For": "127.0.0.1",
				"User-Agent": "TestAgent/1.0",
			}),
		});

		expect(signInRes.token).toBeDefined();

		// Get session and verify IP/user agent are captured with tenant context
		const session = await auth.api.getSession({
			headers: createHeadersWithTenantId(tenantId, {
				authorization: `Bearer ${signInRes.token}`,
			}),
		});

		expect(session?.user.tenantId).toBe(tenantId);
		expect(session?.session.ipAddress).toBe("127.0.0.1");
		expect(session?.session.userAgent).toBe("TestAgent/1.0");
	});
});
