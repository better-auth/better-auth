import { describe, expect, expectTypeOf } from "vitest";
import { organization } from "../../../organization";
import { getOrganizationData } from "../../../test/utils";
import { dynamicAccessControl } from "..";
import { defineInstance, getRoleData } from "../tests/utils";

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
			member: ["create", "read", "update", "delete"],
			invitation: ["create", "read", "delete"],
			organization: ["read", "update"],
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
});
