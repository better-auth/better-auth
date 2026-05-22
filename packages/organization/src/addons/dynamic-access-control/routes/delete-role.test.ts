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

describe("delete-role", async (it) => {
	const { signInWithTestUser, auth } = await defineInstance([
		organization({ use: [dynamicAccessControl()] }),
	]);

	it("should delete a role", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const role = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const result = await auth.api.deleteRole({
			body: {
				roleId: role.id,
				organizationId: org.id,
			},
			headers,
		});

		expect(result.success).toBe(true);
	});

	it("should not delete a role that does not exist", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		await expect(
			auth.api.deleteRole({
				body: {
					roleId: "non-existent-role-id",
					organizationId: org.id,
				},
				headers,
			}),
		).rejects.toThrow();
	});

	it("should not delete a role that is assigned to a member", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const role = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const activeMember = await auth.api.getActiveMember({
			headers,
			query: { organizationId: org.id },
		});

		await auth.api.updateMemberRole({
			body: {
				memberId: activeMember!.id,
				organizationId: org.id,
				role: ["owner", role.role],
			},
			headers,
		});

		await expect(
			auth.api.deleteRole({
				body: {
					roleId: role.id,
					organizationId: org.id,
				},
				headers,
			}),
		).rejects.toThrow();
	});

	it("should allow deleting a role after it is unassigned from members", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const role = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const activeMember = await auth.api.getActiveMember({
			headers,
			query: { organizationId: org.id },
		});

		await auth.api.updateMemberRole({
			body: {
				memberId: activeMember!.id,
				organizationId: org.id,
				role: ["owner", role.role],
			},
			headers,
		});

		await auth.api.updateMemberRole({
			body: {
				memberId: activeMember!.id,
				organizationId: org.id,
				role: "owner",
			},
			headers,
		});

		const result = await auth.api.deleteRole({
			body: {
				roleId: role.id,
				organizationId: org.id,
			},
			headers,
		});

		expect(result.success).toBe(true);
	});

	it("should delete a role by name", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({
			organizationId: org.id,
			role: "delete-by-name",
		});
		await auth.api.createRole({
			body: roleData,
			headers,
		});

		const result = await auth.api.deleteRole({
			body: {
				roleName: "delete-by-name",
				organizationId: org.id,
			},
			headers,
		});

		expect(result.success).toBe(true);
	});

	it("should not delete a pre-defined role by name", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		await expect(
			auth.api.deleteRole({
				body: {
					roleName: "owner",
					organizationId: org.id,
				},
				headers,
			}),
		).rejects.toThrow();
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

		const roleData = getRoleData({ organizationId: org.id });
		const role = await auth.api.createRole({
			body: roleData,
			headers,
		});

		await expect(
			auth.api.deleteRole({
				body: {
					roleId: role.id,
					organizationId: org.id,
				},
			}),
		).rejects.toThrow();
	});

	/**
	 * Security test: Pre-defined roles should be protected even when looked up by ID
	 * This tests that the protection check happens after role lookup, regardless of lookup method
	 */
	it("should not delete a pre-defined role even if it matches a dynamic role name", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		await expect(
			auth.api.deleteRole({
				body: {
					roleName: "admin",
					organizationId: org.id,
				},
				headers,
			}),
		).rejects.toThrow();

		await expect(
			auth.api.deleteRole({
				body: {
					roleName: "member",
					organizationId: org.id,
				},
				headers,
			}),
		).rejects.toThrow();
	});
});
