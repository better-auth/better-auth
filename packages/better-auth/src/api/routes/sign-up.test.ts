import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createHeadersWithTenantId } from "../../test-utils/headers";

describe("sign-up with custom fields", async (it) => {
	const mockFn = vi.fn();
	const { auth, db } = await getTestInstance(
		{
			account: {
				fields: {
					providerId: "provider_id",
					accountId: "account_id",
				},
			},
			user: {
				additionalFields: {
					newField: {
						type: "string",
						required: false,
					},
					newField2: {
						type: "string",
						required: false,
					},
				},
			},
			emailVerification: {
				sendOnSignUp: true,
				sendVerificationEmail: async ({ user, url, token }, request) => {
					mockFn(user, url);
				},
			},
		},
		{
			disableTestUser: true,
		},
	);
	it("should work with custom fields on account table", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "email@test.com",
				password: "password",
				name: "Test Name",
			},
		});
		expect(res.token).toBeDefined();
		const accounts = await db.findMany({
			model: "account",
		});
		expect(accounts).toHaveLength(1);
	});

	it("should send verification email", async () => {
		expect(mockFn).toHaveBeenCalledWith(expect.any(Object), expect.any(String));
	});

	it("should get the ipAddress and userAgent from headers", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "email2@test.com",
				password: "password",
				name: "Test Name",
			},
			headers: new Headers({
				"x-forwarded-for": "127.0.0.1",
				"user-agent": "test-user-agent",
			}),
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${res.token}`,
			}),
		});
		expect(session?.session).toMatchObject({
			userAgent: "test-user-agent",
			ipAddress: "127.0.0.1",
		});
	});
});

describe("sign-up with multi-tenancy", async (it) => {
	const mockFn = vi.fn();
	const { auth, db } = await getTestInstance(
		{
			multiTenancy: {
				enabled: true,
			},
			emailVerification: {
				sendOnSignUp: true,
				sendVerificationEmail: async ({ user, url, token }, request) => {
					mockFn(user, url);
				},
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should create users with different tenant IDs", async () => {
		// Create user in tenant-1
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "user1@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Create user in tenant-2
		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "user2@test.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		expect(tenant1User.token).toBeDefined();
		expect(tenant2User.token).toBeDefined();

		// Get sessions to verify tenant IDs
		const tenant1Session = await auth.api.getSession({
			headers: createHeadersWithTenantId("tenant-1", {
				authorization: `Bearer ${tenant1User.token}`,
			}),
		});

		const tenant2Session = await auth.api.getSession({
			headers: createHeadersWithTenantId("tenant-2", {
				authorization: `Bearer ${tenant2User.token}`,
			}),
		});

		expect(tenant1Session?.user.tenantId).toBe("tenant-1");
		expect(tenant2Session?.user.tenantId).toBe("tenant-2");
		expect(tenant1Session?.user.id).not.toBe(tenant2Session?.user.id);
	});

	it("should allow same email in different tenants", async () => {
		const email = "same@test.com";

		// Create user with same email in tenant-1
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User in Tenant 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Create user with same email in tenant-2 (should work due to tenant isolation)
		const tenant2User = await auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User in Tenant 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		expect(tenant1User.token).toBeDefined();
		expect(tenant2User.token).toBeDefined();

		// Verify both users exist with same email but different tenant IDs
		const tenant1Session = await auth.api.getSession({
			headers: createHeadersWithTenantId("tenant-1", {
				authorization: `Bearer ${tenant1User.token}`,
			}),
		});

		const tenant2Session = await auth.api.getSession({
			headers: createHeadersWithTenantId("tenant-2", {
				authorization: `Bearer ${tenant2User.token}`,
			}),
		});

		expect(tenant1Session?.user.email).toBe(email);
		expect(tenant2Session?.user.email).toBe(email);
		expect(tenant1Session?.user.tenantId).toBe("tenant-1");
		expect(tenant2Session?.user.tenantId).toBe("tenant-2");
		expect(tenant1Session?.user.id).not.toBe(tenant2Session?.user.id);
	});

	it("should prevent duplicate email within same tenant", async () => {
		const email = "duplicate@test.com";
		const tenantId = "tenant-1";

		// Create first user
		const firstUser = await auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "First User",
			},
			headers: createHeadersWithTenantId(tenantId),
		});

		expect(firstUser.token).toBeDefined();

		// Try to create second user with same email in same tenant (should fail)
		const secondUserAttempt = auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "Second User",
			},
			headers: createHeadersWithTenantId(tenantId),
		});

		await expect(secondUserAttempt).rejects.toThrow();
	});

	it("should send verification emails with correct tenant context", async () => {
		const tenant1Email = "verify1@test.com";
		const tenant2Email = "verify2@test.com";

		// Reset mock before test
		mockFn.mockClear();

		// Create users in different tenants
		await auth.api.signUpEmail({
			body: {
				email: tenant1Email,
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		await auth.api.signUpEmail({
			body: {
				email: tenant2Email,
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Verify both verification emails were sent
		expect(mockFn).toHaveBeenCalledTimes(2);

		// Check that users have correct tenant IDs in verification emails
		const firstCall = mockFn.mock.calls[0];
		const secondCall = mockFn.mock.calls[1];

		expect(firstCall[0]).toMatchObject({
			email: tenant1Email,
			tenantId: "tenant-1",
		});
		expect(secondCall[0]).toMatchObject({
			email: tenant2Email,
			tenantId: "tenant-2",
		});
	});
});
