import { describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { createHeadersWithTenantId } from "../test-utils/headers";

describe("multi-tenancy", async () => {
	const { auth } = await getTestInstance(
		{
			multiTenancy: {
				enabled: true,
			},
		},
		{ disableTestUser: true },
	);

	it("should create users with different tenantIds", async () => {
		// Create user in tenant 1
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "user@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Create user in tenant 2 with same email (should work due to tenant isolation)
		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "user@test.com", // Same email, different tenant
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		expect(tenant1User.token).toBeDefined();
		expect(tenant1User.user.tenantId).toBe("tenant-1");

		expect(tenant2User.token).toBeDefined();
		expect(tenant2User.user.tenantId).toBe("tenant-2");

		// Get sessions to verify tenant IDs and user data
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

		expect(tenant1Session?.user.email).toBe("user@test.com");
		expect(tenant1Session?.user.tenantId).toBe("tenant-1");
		expect(tenant1Session?.user.name).toBe("User 1");
		expect(tenant2Session?.user.email).toBe("user@test.com");
		expect(tenant2Session?.user.tenantId).toBe("tenant-2");
		expect(tenant2Session?.user.name).toBe("User 2");
		expect(tenant1Session?.user.id).not.toBe(tenant2Session?.user.id);
	});
});
