import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect, expectTypeOf } from "vitest";
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

describe("update-role", async (it) => {
	const { signInWithTestUser, auth } = await defineInstance([
		organization({ use: [dynamicAccessControl()] }),
	]);

	it("should update a role's permissions", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const newPermissions = {
			member: ["create", "update"],
			organization: ["update"],
		};

		const updatedRole = await auth.api.updateRole({
			body: {
				roleId: createdRole.id,
				organizationId: org.id,
				data: {
					permissions: newPermissions,
				},
			},
			headers,
		});

		expect(updatedRole?.permissions).toEqual(newPermissions);
		expect(updatedRole?.role).toBe(roleData.role);
		expectTypeOf(updatedRole).toEqualTypeOf<{
			id: string;
			role: string;
			organizationId: string;
			permissions: Record<string, string[]>;
			createdAt: Date;
			updatedAt?: Date | undefined;
		} | null>();
	});

	it("should rename a role", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id, role: "old-name" });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const updatedRole = await auth.api.updateRole({
			body: {
				roleId: createdRole.id,
				organizationId: org.id,
				data: {
					roleName: "new-name",
				},
			},
			headers,
		});

		expect(updatedRole?.role).toBe("new-name");
	});

	it("should not allow renaming to an existing role name", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData1 = getRoleData({ organizationId: org.id, role: "role-one" });
		const roleData2 = getRoleData({ organizationId: org.id, role: "role-two" });

		await auth.api.createRole({ body: roleData1, headers });
		const role2 = await auth.api.createRole({ body: roleData2, headers });

		await expect(
			auth.api.updateRole({
				body: {
					roleId: role2.id,
					organizationId: org.id,
					data: {
						roleName: "role-one",
					},
				},
				headers,
			}),
		).rejects.toThrow();
	});

	it("should not allow renaming to a default role name", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		await expect(
			auth.api.updateRole({
				body: {
					roleId: createdRole.id,
					organizationId: org.id,
					data: {
						roleName: "admin",
					},
				},
				headers,
			}),
		).rejects.toThrow();
	});

	it("should return error when role does not exist", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		await expect(
			auth.api.updateRole({
				body: {
					roleId: "non-existent-role-id",
					organizationId: org.id,
					data: {
						roleName: "new-name",
					},
				},
				headers,
			}),
		).rejects.toThrow();
	});

	it("should update both name and permissions at once", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const newPermissions = {
			member: ["create", "update"],
		};

		const updatedRole = await auth.api.updateRole({
			body: {
				roleId: createdRole.id,
				organizationId: org.id,
				data: {
					roleName: "updated-role",
					permissions: newPermissions,
				},
			},
			headers,
		});

		expect(updatedRole?.role).toBe("updated-role");
		expect(updatedRole?.permissions).toEqual(newPermissions);
	});

	it("should keep role name when renaming to same name", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id, role: "same-name" });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const updatedRole = await auth.api.updateRole({
			body: {
				roleId: createdRole.id,
				organizationId: org.id,
				data: {
					roleName: "same-name",
				},
			},
			headers,
		});

		expect(updatedRole?.role).toBe("same-name");
	});

	it("should update role by name instead of id", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({
			organizationId: org.id,
			role: "lookup-by-name",
		});
		await auth.api.createRole({
			body: roleData,
			headers,
		});

		const updatedRole = await auth.api.updateRole({
			body: {
				roleName: "lookup-by-name",
				organizationId: org.id,
				data: {
					permissions: { member: ["create", "update"] },
				},
			},
			headers,
		});

		expect(updatedRole?.role).toBe("lookup-by-name");
		expect(updatedRole?.permissions).toEqual({ member: ["create", "update"] });
	});

	it("should not allow updating a role with permissions the user does not have", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const invalidPermissions = {
			member: ["nonexistent-action"],
		};

		await expect(
			auth.api.updateRole({
				body: {
					roleId: createdRole.id,
					organizationId: org.id,
					data: {
						permissions: invalidPermissions,
					},
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
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		await expect(
			auth.api.updateRole({
				body: {
					roleId: createdRole.id,
					organizationId: org.id,
					data: {
						roleName: "new-name",
					},
				},
			}),
		).rejects.toThrow();
	});

	/**
	 * Security test: Invalid resource names should be rejected
	 */
	it("should reject updates with invalid resource names", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const invalidResourcePermissions = {
			"invalid-resource-that-does-not-exist": ["create"],
		};

		await expect(
			auth.api.updateRole({
				body: {
					roleId: createdRole.id,
					organizationId: org.id,
					data: {
						permissions: invalidResourcePermissions,
					},
				},
				headers,
			}),
		).rejects.toThrow();
	});

	/**
	 * Security test: Non-members should not be able to update roles
	 */
	it("should reject updates from non-members of the organization", async () => {
		const { headers: ownerHeaders } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers: ownerHeaders,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers: ownerHeaders,
		});

		// Create a separate user who is not a member of the organization
		const otherUser = await auth.api.signUpEmail({
			body: {
				email: `non-member-update-role-${Date.now()}@example.com`,
				password: "password123",
				name: "Non Member User",
			},
			returnHeaders: true,
		});
		const otherHeaders = {
			cookie: otherUser.headers.getSetCookie()[0]!,
		};

		await expect(
			auth.api.updateRole({
				body: {
					roleId: createdRole.id,
					organizationId: org.id,
					data: {
						roleName: "hacked-role",
					},
				},
				headers: otherHeaders,
			}),
		).rejects.toThrow();
	});
});
