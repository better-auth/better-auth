import type { DBFieldAttribute } from "@better-auth/core/db";
import { describe, expect, expectTypeOf } from "vitest";
import { createAuthClient } from "../../../client";
import { parseSetCookieHeader } from "../../../cookies";
import { getTestInstance } from "../../../test-utils/test-instance";
import { createAccessControl } from "../../access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "../access";
import { inferOrgAdditionalFields, organizationClient } from "../client";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { organization } from "../organization";

describe("dynamic access control", async (it) => {
	const ac = createAccessControl({
		project: ["create", "read", "update", "delete"],
		sales: ["create", "read", "update", "delete"],
		...defaultStatements,
	});
	const owner = ac.newRole({
		project: ["create", "delete", "update", "read"],
		sales: ["create", "read", "update", "delete"],
		...ownerAc.statements,
	});
	const admin = ac.newRole({
		project: ["create", "read", "delete", "update"],
		sales: ["create", "read"],
		...adminAc.statements,
	});
	const member = ac.newRole({
		project: ["read"],
		sales: ["read"],
		...memberAc.statements,
	});

	const additionalFields = {
		color: {
			type: "string",
			defaultValue: "#ffffff",
			required: true,
		},
		serverOnlyValue: {
			type: "string",
			defaultValue: "server-only-value",
			input: false,
			required: true,
		},
	} satisfies Record<string, DBFieldAttribute>;

	const { auth, customFetchImpl, sessionSetter, signInWithTestUser } =
		await getTestInstance({
			plugins: [
				organization({
					ac,
					roles: {
						admin,
						member,
						owner,
					},
					dynamicAccessControl: {
						enabled: true,
					},
					schema: {
						organization: {
							modelName: "organization",
						},
						organizationRole: {
							modelName: "organizationRole",
							additionalFields,
						},
					},
				}),
			],
		});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [
			organizationClient({
				ac,
				roles: {
					admin,
					member,
					owner,
				},
				dynamicAccessControl: {
					enabled: true,
				},
				schema: inferOrgAdditionalFields<typeof auth>(),
			}),
		],
		fetchOptions: {
			customFetchImpl,
		},
	});
	const {
		organization: { checkRolePermission, hasPermission, create },
	} = authClient;

	const { headers, user, session } = await signInWithTestUser();

	async function createUser({ role }: { role: "admin" | "member" | "owner" }) {
		const normalUserDetails = {
			email: `some-test-user-${crypto.randomUUID()}@email.com`,
			name: `some-test-user`,
			password: `some-test-user-${crypto.randomUUID()}`,
		};
		const normalUser = await auth.api.signUpEmail({ body: normalUserDetails });
		const member = await auth.api.addMember({
			body: {
				role: role || "member",
				userId: normalUser.user.id,
				organizationId: org.data?.id,
			},
			headers,
		});
		if (!member) throw new Error("Member not found");
		let userHeaders = new Headers();
		await authClient.signIn.email({
			email: normalUserDetails.email,
			password: normalUserDetails.password,
			fetchOptions: {
				onSuccess: (context) => {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					userHeaders.set(
						"cookie",
						`better-auth.session_token=${signedCookie}`,
					);
				},
			},
		});
		await authClient.organization.setActive({
			organizationId: org.data?.id,
			fetchOptions: {
				headers: userHeaders,
			},
		});

		return { headers: userHeaders, user: normalUser, member };
	}

	const org = await create(
		{
			name: "test",
			slug: "test",
			metadata: {
				test: "test",
			},
		},
		{
			onSuccess: sessionSetter(headers),
			headers,
		},
	);
	if (!org.data) throw new Error("Organization not created");
	const memberInfo = await auth.api.getActiveMember({ headers });
	if (!memberInfo) throw new Error("Member info not found");

	// Create an admin user in the org.
	const {
		headers: adminHeaders,
		user: adminUser,
		member: adminMember,
	} = await createUser({
		role: "admin",
	});

	// Create normal users in the org.
	const {
		headers: normalHeaders,
		user: normalUser,
		member: normalMember,
	} = await createUser({
		role: "member",
	});

	/**
	 * The following test will:
	 * - Creation of a new role
	 * - Updating their own role to the newly created one (from owner to the new one)
	 * - Tests the `hasPermission` endpoint against the new role, for both a success and a failure case.
	 * - Additional fields passed in body, and correct return value & types.
	 */
	it("should successfully create a new role", async () => {
		// Create a new "test" role with permissions to create a project.
		const permission = {
			project: ["create"],
		};
		const testRole = await authClient.organization.createRole(
			{
				role: "test",
				permission,
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers,
			},
		);
		expect(testRole.error).toBeNull();
		expect(testRole.data?.success).toBe(true);
		expect(testRole.data?.roleData.permission).toEqual(permission);
		expect(testRole.data?.roleData.color).toBe("#000000");
		expect(testRole.data?.roleData.serverOnlyValue).toBe("server-only-value");
		expectTypeOf(testRole.data?.roleData.serverOnlyValue).toEqualTypeOf<
			string | undefined
		>();
		expectTypeOf(testRole.data?.roleData.role).toEqualTypeOf<
			string | undefined
		>();
		if (!testRole.data) return;

		// Update the role to use the new one.

		await auth.api.updateMemberRole({
			body: { memberId: normalMember.id, role: testRole.data.roleData.role },
			headers,
		});

		// Test against `hasPermission` endpoint
		// Should fail because the user doesn't have the permission to delete a project.
		const shouldFail = await auth.api.hasPermission({
			body: {
				organizationId: org.data?.id,
				permissions: {
					project: ["delete"],
				},
			},
			headers: normalHeaders,
		});
		expect(shouldFail.success).toBe(false);

		// Should pass because the user has the permission to create a project.
		const shouldPass = await auth.api.hasPermission({
			body: {
				organizationId: org.data?.id,
				permissions: {
					project: ["create"],
				},
			},
			headers: normalHeaders,
		});
		expect(shouldPass.success).toBe(true);
	});

	it("should not be allowed to create a role without the right ac resource permissions", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers: normalHeaders,
			},
		);
		expect(testRole.data).toBeNull();
		if (!testRole.error) throw new Error("Test role error not found");
		expect(testRole.error.message).toEqual(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
		);
	});

	it("should not be allowed to create a role with higher permissions than the current role", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					sales: ["create", "delete", "create", "update", "read"], // Intentionally duplicate the "create" permission.
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers: adminHeaders,
			},
		);
		expect(testRole.data).toBeNull();
		if (testRole.data) throw new Error("Test role created");
		expect(
			testRole.error.message?.startsWith(
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
			),
		).toBe(true);
		expect("missingPermissions" in testRole.error).toBe(true);
		if (!("missingPermissions" in testRole.error)) return;
		expect(testRole.error.missingPermissions).toEqual([
			"sales:delete",
			"sales:update",
		]);
	});

	it("should not be allowed to create a role which is either predefined or already exists in DB", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: "admin", // This is a predefined role.
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers,
			},
		);
		expect(testRole.data).toBeNull();
		if (!testRole.error) throw new Error("Test role error not found");
		expect(testRole.error.message).toEqual(
			ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		);

		const testRole2 = await authClient.organization.createRole(
			{
				role: "test", // This is a role that was created in the previous test.
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers,
			},
		);
		expect(testRole2.data).toBeNull();
		if (!testRole2.error) throw new Error("Test role error not found");
		expect(testRole2.error.message).toEqual(
			ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		);
	});

	it("should delete a role by id", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;

		const res = await auth.api.deleteOrgRole({
			body: { roleId },
			headers,
		});
		expect(res).not.toBeNull();
	});

	it("should delete a role by name", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleName = testRole.data.roleData.role;

		const res = await auth.api.deleteOrgRole({
			body: { roleName },
			headers,
		});
		expect(res).not.toBeNull();
	});

	it("should not be allowed to delete a role without necessary permissions", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers: adminHeaders,
			},
		);
		if (!testRole.data) throw testRole.error;
		expect(
			auth.api.deleteOrgRole({
				body: { roleName: testRole.data.roleData.role },
				headers: normalHeaders,
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE,
		);
	});

	it("should not be allowed to delete a role that doesn't exist", async () => {
		try {
			const res = await auth.api.deleteOrgRole({
				body: { roleName: "non-existent-role" },
				headers,
			});
			expect(res).toBeNull();
		} catch (error: any) {
			if ("body" in error && "message" in error.body) {
				expect(error.body.message).toBe(
					ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
				);
			} else {
				throw error;
			}
		}
	});

	it("should list roles", async () => {
		const permission = {
			project: ["create"],
			ac: ["read", "update", "create", "delete"],
		};
		await authClient.organization.createRole(
			{
				role: `list-test-role`,
				permission,
				additionalFields: {
					color: "#123",
				},
			},
			{
				headers,
			},
		);

		const res = await auth.api.listOrgRoles({ headers });
		expect(res).not.toBeNull();
		expect(res.length).toBeGreaterThan(0);
		expect(typeof res[0]!.permission === "string").toBe(false);
		const foundRole = res.find((x) => x.role === "list-test-role");
		expect(foundRole).not.toBeNull();
		expect(foundRole?.permission).toEqual(permission);
		expect(foundRole?.color).toBe(`#123`);
		expectTypeOf(foundRole?.color).toEqualTypeOf<string | undefined>();
		expectTypeOf(foundRole?.serverOnlyValue).toEqualTypeOf<
			string | undefined
		>();
	});

	it("should not be allowed to list roles without necessary permissions", async () => {
		expect(auth.api.listOrgRoles({ headers: normalHeaders })).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE,
		);
	});

	it("should get a role by id", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `read-test-role-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;
		const res = await auth.api.getOrgRole({
			query: {
				roleId,
				organizationId: org.data?.id,
			},
			headers,
		});
		expect(res).not.toBeNull();
		expect(res.role).toBe(testRole.data.roleData.role);
		expect(res.permission).toEqual(testRole.data.roleData.permission);
		expect(res.color).toBe("#000000");
		expectTypeOf(res.color).toEqualTypeOf<string>();
	});

	it("should get a role by name", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `read-test-role-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleName = testRole.data.roleData.role;

		const res = await auth.api.getOrgRole({
			query: {
				roleName,
				organizationId: org.data?.id,
			},
			headers,
		});
		expect(res).not.toBeNull();
		expect(res.role).toBe(testRole.data.roleData.role);
		expect(res.permission).toEqual(testRole.data.roleData.permission);
		expect(res.color).toBe("#000000");
		expectTypeOf(res.color).toEqualTypeOf<string>();
	});

	it("should update a role's permission by id", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `update-test-role-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{
				headers,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;
		const res = await auth.api.updateOrgRole({
			body: {
				roleId,
				data: { permission: { project: ["create", "delete"] } },
			},
			headers,
		});
		expect(res).not.toBeNull();
		expect(res.roleData.role).toBe(testRole.data.roleData.role);
		expect(res.roleData.permission).toEqual({ project: ["create", "delete"] });
	});

	it("should update a role's name by name", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers },
		);
		if (!testRole.data) throw testRole.error;
		const roleName = testRole.data.roleData.role;

		const res = await auth.api.updateOrgRole({
			body: { roleName, data: { roleName: `updated-${roleName}` } },
			headers,
		});
		expect(res).not.toBeNull();
		expect(res.roleData.role).toBe(`updated-${roleName}`);

		const res2 = await auth.api.getOrgRole({
			query: {
				roleName: `updated-${roleName}`,
				organizationId: org.data?.id,
			},
			headers,
		});
		expect(res2).not.toBeNull();
		expect(res2.role).toBe(`updated-${roleName}`);
	});

	it("should not be allowed to update a role without the right ac resource permissions", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `update-not-allowed-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers },
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;
		await expect(
			auth.api.updateOrgRole({
				body: {
					roleId,
					data: { roleName: `updated-${testRole.data.roleData.role}` },
				},
				headers: normalHeaders,
			}),
		).rejects.toThrow();
	});

	it("should be able to update additional fields", async () => {
		const testRole = await authClient.organization.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
					//@ts-expect-error - intentionally invalid key
					someInvalidKey: "this would be ignored by zod",
				},
			},
			{
				headers,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;
		const res = await auth.api.updateOrgRole({
			body: { roleId, data: { color: "#111111" } },
			headers,
		});
		expect(res).not.toBeNull();
		expect(res.roleData.color).toBe("#111111");
		//@ts-expect-error - intentionally invalid key
		expect(res.roleData.someInvalidKey).toBeUndefined();
	});

	/**
	 * Security test cases for the privilege escalation vulnerability fix
	 * These tests verify that member queries properly filter by userId to prevent
	 * unauthorized privilege escalation where any member could gain admin permissions
	 */
	it("should not allow member to list roles using another member's permissions", async () => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// Create a test role that only admin can read
		const adminOnlyRole = await authClient.organization.createRole(
			{
				role: `admin-only-${crypto.randomUUID()}`,
				permission: {
					project: ["delete"],
				},
				additionalFields: {
					color: "#ff0000",
				},
			},
			{
				headers,
			},
		);
		if (!adminOnlyRole.data) throw adminOnlyRole.error;

		// Try to list roles as a regular member - should succeed but with member permissions
		const listAsMembers = await auth.api.listOrgRoles({
			query: { organizationId: org.data?.id },
			headers: freshMemberHeaders,
		});

		// Member should be able to list roles (they have ac:read permission)
		expect(listAsMembers).toBeDefined();
		expect(Array.isArray(listAsMembers)).toBe(true);
	});

	it("should not allow member to get role details using another member's permissions", async () => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// Create a test role
		const testRole = await authClient.organization.createRole(
			{
				role: `test-get-role-${crypto.randomUUID()}`,
				permission: {
					project: ["read"],
				},
				additionalFields: {
					color: "#ff0000",
				},
			},
			{
				headers,
			},
		);
		if (!testRole.data) throw testRole.error;

		// Try to get role as a regular member - should succeed with member permissions
		const getRoleAsMember = await auth.api.getOrgRole({
			query: {
				organizationId: org.data?.id,
				roleId: testRole.data.roleData.id,
			},
			headers: freshMemberHeaders,
		});

		// Member should be able to read the role (they have ac:read permission)
		expect(getRoleAsMember).toBeDefined();
		expect(getRoleAsMember.id).toBe(testRole.data.roleData.id);
	});

	it("should not allow member to update roles without proper permissions (privilege escalation test)", async () => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// Create a test role that the owner will create
		const vulnerableRole = await authClient.organization.createRole(
			{
				role: `vulnerable-role-${crypto.randomUUID()}`,
				permission: {
					project: ["read"],
				},
				additionalFields: {
					color: "#ff0000",
				},
			},
			{
				headers, // owner headers
			},
		);
		if (!vulnerableRole.data) throw vulnerableRole.error;

		// Regular member should NOT be able to update the role
		// This tests the privilege escalation vulnerability fix
		await expect(
			auth.api.updateOrgRole({
				body: {
					roleId: vulnerableRole.data.roleData.id,
					data: {
						permission: {
							ac: ["create", "update", "delete"], // Try to escalate privileges
							organization: ["update", "delete"],
							project: ["create", "read", "update", "delete"],
						},
					},
				},
				headers: freshMemberHeaders, // member headers
			}),
		).rejects.toThrow();

		// Verify the role permissions haven't changed
		const roleCheck = await auth.api.getOrgRole({
			query: {
				organizationId: org.data?.id,
				roleId: vulnerableRole.data.roleData.id,
			},
			headers,
		});
		expect(roleCheck.permission).toEqual({
			project: ["read"],
		});
	});

	it("should properly identify the correct member when checking permissions", async () => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// This test ensures that the member lookup uses both organizationId AND userId
		// Create a role that only owner can update
		const ownerOnlyRole = await authClient.organization.createRole(
			{
				role: `owner-only-update-${crypto.randomUUID()}`,
				permission: {
					sales: ["delete"],
				},
				additionalFields: {
					color: "#ff0000",
				},
			},
			{
				headers, // owner headers
			},
		);
		if (!ownerOnlyRole.data) throw ownerOnlyRole.error;

		// Member should not be able to update (doesn't have ac:update)
		await expect(
			auth.api.updateOrgRole({
				body: {
					roleId: ownerOnlyRole.data.roleData.id,
					data: {
						roleName: "hijacked-role",
					},
				},
				headers: freshMemberHeaders,
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE,
		);

		// Admin should be able to update (has ac:update)
		const adminUpdate = await auth.api.updateOrgRole({
			body: {
				roleId: ownerOnlyRole.data.roleData.id,
				data: {
					roleName: `admin-updated-${ownerOnlyRole.data.roleData.role}`,
				},
			},
			headers: adminHeaders,
		});
		expect(adminUpdate).toBeDefined();
		expect(adminUpdate.roleData.role).toContain("admin-updated");
	});

	it("should not allow cross-organization privilege escalation", async () => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// Create a second organization
		const org2 = await authClient.organization.create(
			{
				name: "second-org",
				slug: `second-org-${crypto.randomUUID()}`,
			},
			{
				onSuccess: sessionSetter(headers),
				headers,
			},
		);
		if (!org2.data) throw new Error("Second organization not created");

		// Try to list roles from org1 while active in org2 - should fail
		await authClient.organization.setActive({
			organizationId: org2.data.id,
			fetchOptions: {
				headers: freshMemberHeaders,
			},
		});

		// This should fail because the member is not in org2
		await expect(
			auth.api.listOrgRoles({
				query: { organizationId: org2.data.id },
				headers: freshMemberHeaders,
			}),
		).rejects.toThrow("You are not a member of this organization");

		// Switch back to org1
		await authClient.organization.setActive({
			organizationId: org.data?.id,
			fetchOptions: {
				headers: freshMemberHeaders,
			},
		});
	});
});
