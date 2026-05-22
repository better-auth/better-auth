import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect } from "vitest";
import { organizationClient } from "../../../client";
import { organization } from "../../../organization";
import { getOrganizationData } from "../../../test/utils";
import { dynamicAccessControl } from "..";
import { getRoleData } from "../tests/utils";

async function defineInstance<Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) {
	const instance = await getTestInstance(
		{
			plugins: plugins,
			logger: {
				level: "error",
			},
		},
		{
			clientOptions: {
				plugins: [organizationClient()],
			},
		},
	);

	const adapter = (await instance.auth.$context).adapter;

	return { ...instance, adapter };
}

describe("list-roles", async (it) => {
	const { signInWithTestUser, auth } = await defineInstance([
		organization({ use: [dynamicAccessControl()] }),
	]);

	it("should list roles for an organization", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData1 = getRoleData({ organizationId: org.id });
		const roleData2 = getRoleData({ organizationId: org.id });

		await auth.api.createRole({ body: roleData1, headers });
		await auth.api.createRole({ body: roleData2, headers });

		const result = await auth.api.listRoles({
			query: { organizationId: org.id },
			headers,
		});

		expect(result.roles).toHaveLength(2);
		expect(result.total).toBe(2);
	});

	it("should return empty array when no roles exist", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const result = await auth.api.listRoles({
			query: { organizationId: org.id },
			headers,
		});

		expect(result.roles).toHaveLength(0);
		expect(result.total).toBe(0);
	});

	it("should support pagination with limit and offset", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		for (let i = 0; i < 5; i++) {
			const roleData = getRoleData({ organizationId: org.id });
			await auth.api.createRole({ body: roleData, headers });
		}

		// First page
		const result = await auth.api.listRoles({
			query: {
				organizationId: org.id,
				limit: 2,
				offset: 0,
			},
			headers,
		});

		expect(result.roles).toHaveLength(2);
		expect(result.total).toBe(5);

		// Second page
		const result2 = await auth.api.listRoles({
			query: {
				organizationId: org.id,
				limit: 2,
				offset: 2,
			},
			headers,
		});

		expect(result2.roles).toHaveLength(2);
		expect(result2.total).toBe(5);

		// Last page
		const result3 = await auth.api.listRoles({
			query: {
				organizationId: org.id,
				limit: 2,
				offset: 4,
			},
			headers,
		});

		expect(result3.roles).toHaveLength(1);
		expect(result3.total).toBe(5);
	});

	it("should only list roles for the specified organization", async () => {
		const { headers } = await signInWithTestUser();

		const orgData1 = getOrganizationData();
		const org1 = await auth.api.createOrganization({
			body: orgData1,
			headers,
		});

		const orgData2 = getOrganizationData();
		const org2 = await auth.api.createOrganization({
			body: orgData2,
			headers,
		});

		const roleData1 = getRoleData({ organizationId: org1.id });
		const roleData2 = getRoleData({ organizationId: org2.id });

		await auth.api.createRole({ body: roleData1, headers });
		await auth.api.createRole({ body: roleData2, headers });

		const result1 = await auth.api.listRoles({
			query: { organizationId: org1.id },
			headers,
		});

		expect(result1.roles).toHaveLength(1);
		expect(result1.roles[0].organizationId).toBe(org1.id);

		const result2 = await auth.api.listRoles({
			query: { organizationId: org2.id },
			headers,
		});

		expect(result2.roles).toHaveLength(1);
		expect(result2.roles[0].organizationId).toBe(org2.id);
	});

	it("should support sorting by role name", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		await auth.api.createRole({
			body: getRoleData({ organizationId: org.id, role: "z-role" }),
			headers,
		});
		await auth.api.createRole({
			body: getRoleData({ organizationId: org.id, role: "a-role" }),
			headers,
		});

		const resultAsc = await auth.api.listRoles({
			query: {
				organizationId: org.id,
				sortBy: "role",
				sortDirection: "asc",
			},
			headers,
		});

		expect(resultAsc.roles[0].role).toBe("a-role");
		expect(resultAsc.roles[1].role).toBe("z-role");

		const resultDesc = await auth.api.listRoles({
			query: {
				organizationId: org.id,
				sortBy: "role",
				sortDirection: "desc",
			},
			headers,
		});

		expect(resultDesc.roles[0].role).toBe("z-role");
		expect(resultDesc.roles[1].role).toBe("a-role");
	});

	/**
	 * Security test: Unauthenticated requests should be rejected
	 */
	it("should reject unauthenticated requests", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		await expect(
			auth.api.listRoles({
				query: { organizationId: org.id },
			}),
		).rejects.toThrow();
	});

	/**
	 * Security test: Non-members should not be able to list roles
	 */
	it("should reject requests from non-members of the organization", async () => {
		const { headers: ownerHeaders } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers: ownerHeaders,
		});

		await auth.api.createRole({
			body: getRoleData({ organizationId: org.id }),
			headers: ownerHeaders,
		});

		// Create a separate user who is not a member of the organization
		const otherUser = await auth.api.signUpEmail({
			body: {
				email: `non-member-list-roles-${Date.now()}@example.com`,
				password: "password123",
				name: "Non Member User",
			},
			returnHeaders: true,
		});
		const otherHeaders = {
			cookie: otherUser.headers.getSetCookie()[0]!,
		};

		await expect(
			auth.api.listRoles({
				query: { organizationId: org.id },
				headers: otherHeaders,
			}),
		).rejects.toThrow();
	});
});
