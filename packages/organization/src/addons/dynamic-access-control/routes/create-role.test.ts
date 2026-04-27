import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect, expectTypeOf } from "vitest";
import { organizationClient } from "../../../client";
import { organization } from "../../../organization";
import { getOrganizationData } from "../../../test/utils";
import { dynamicAccessControl } from "..";
import { getRoleData } from "../tests/utils";

/**
 * Helper to define `getTestInstance` as a shorter alias, specific to the organization plugin.
 * @internal
 */
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

describe("dynamic-access-control", async (it) => {
	const { signInWithTestUser, auth } = await defineInstance([
		organization({ use: [dynamicAccessControl()] }),
	]);

	it("should create a role", async () => {
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

		expect(role?.id).toBeDefined();
		expect(role?.role).toBe(roleData.role);
		expect(role?.permissions).toEqual(roleData.permissions);
		expect(role?.organizationId).toBe(org.id);
		expectTypeOf(role).toEqualTypeOf<{
			id: string;
			role: string;
			organizationId: string;
			permissions: Record<string, string[]>;
			createdAt: Date;
			updatedAt?: Date | undefined;
		}>();
	});

	it("should not allow creating duplicate role names in same org", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({
			organizationId: org.id,
			role: "admin",
		});

		// Create first role
		await auth.api.createRole({
			body: roleData,
			headers,
		});

		// Try to create duplicate
		await expect(
			auth.api.createRole({
				body: roleData,
				headers,
			}),
		).rejects.toThrow();
	});

	it("should allow same role name in different organizations", async () => {
		const { headers } = await signInWithTestUser();

		// Create first organization
		const orgData1 = getOrganizationData();
		const org1 = await auth.api.createOrganization({
			body: orgData1,
			headers,
		});

		// Create second organization
		const orgData2 = getOrganizationData();
		const org2 = await auth.api.createOrganization({
			body: orgData2,
			headers,
		});

		const roleName = "admin";

		// Create role in first org
		const role1 = await auth.api.createRole({
			body: getRoleData({ organizationId: org1.id, role: roleName }),
			headers,
		});

		// Create role in second org - should succeed
		const role2 = await auth.api.createRole({
			body: getRoleData({ organizationId: org2.id, role: roleName }),
			headers,
		});

		expect(role1.role).toBe(roleName);
		expect(role2.role).toBe(roleName);
		expect(role1.organizationId).not.toBe(role2.organizationId);
	});

	it("should create role with complex permissions", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const complexPermissions = {
			member: ["create", "update", "delete"],
			invitation: ["create", "cancel"],
			organization: ["update", "delete"],
		};

		const roleData = getRoleData({
			organizationId: org.id,
			permissions: complexPermissions,
		});

		const role = await auth.api.createRole({
			body: roleData,
			headers,
		});

		expect(role.permissions).toEqual(complexPermissions);
	});

	it("should not allow creating a role with permissions the user does not have", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const invalidPermissions = {
			member: ["nonexistent-action"],
		};

		const roleData = getRoleData({
			organizationId: org.id,
			permissions: invalidPermissions,
		});

		await expect(
			auth.api.createRole({
				body: roleData,
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

		await expect(
			auth.api.createRole({
				body: roleData,
			}),
		).rejects.toThrow();
	});

	/**
	 * Security test: Invalid resource names should be rejected
	 */
	it("should reject roles with invalid resource names", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const invalidResourcePermissions = {
			"invalid-resource-that-does-not-exist": ["create"],
		};

		const roleData = getRoleData({
			organizationId: org.id,
			permissions: invalidResourcePermissions,
		});

		await expect(
			auth.api.createRole({
				body: roleData,
				headers,
			}),
		).rejects.toThrow();
	});
});
