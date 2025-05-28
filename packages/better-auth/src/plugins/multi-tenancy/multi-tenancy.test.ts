import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "../organization";
import { createAuthClient } from "../../client";
import { organizationClient } from "../organization/client";

describe("multi-tenancy", async () => {
	const tenantResolver = (request: Request) => {
		const url = new URL(request.url);
		const tenantId = url.searchParams.get("tenantId") || "tenant-1";
		return tenantId;
	};

	const { customFetchImpl } = await getTestInstance({
		multiTenancy: {
			enabled: true,
			tenantResolver,
		},
		plugins: [organization()],
	});

	const createTenantClient = (tenantId: string) => {
		return createAuthClient({
			baseURL: "http://localhost:3000/api/auth",
			plugins: [organizationClient()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					if (url instanceof Request) {
						return customFetchImpl(url, init);
					}
					const urlWithTenant = new URL(url);
					urlWithTenant.searchParams.set("tenantId", tenantId);
					return customFetchImpl(urlWithTenant.toString(), init);
				},
			},
		});
	};

	it("should resolve tenant from request", async () => {
		const request = new Request("http://localhost:3000?tenantId=test-tenant");
		const resolvedTenant = tenantResolver(request);
		expect(resolvedTenant).toBe("test-tenant");
	});

	it("should create users with different tenantIds", async () => {
		const tenant1Client = createTenantClient("tenant-1");
		const tenant2Client = createTenantClient("tenant-2");

		// Create user in tenant 1
		const tenant1User = await tenant1Client.signUp.email({
			email: "user@test.com",
			password: "password",
			name: "User 1",
		});

		// Create user in tenant 2 with same email (should work due to tenant isolation)
		const tenant2User = await tenant2Client.signUp.email({
			email: "user@test.com", // Same email, different tenant
			password: "password",
			name: "User 2",
		});

		expect(tenant1User.data?.user.email).toBe("user@test.com");
		expect(tenant2User.data?.user.email).toBe("user@test.com");
		expect(tenant1User.data?.user.id).not.toBe(tenant2User.data?.user.id);
	});
});
