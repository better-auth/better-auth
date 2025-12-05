import type { DBFieldAttribute } from "@better-auth/core/db";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createAuthClient } from "../../../client";
import { getTestInstance } from "../../../test-utils";
import { createAccessControl } from "../../access";
import {
	adminAc as defaultAdminAc,
	defaultStatements,
	userAc as defaultUserAc,
} from "../access";
import { admin } from "../admin";
import { adminClient } from "../client";
import { ADMIN_ERROR_CODES } from "../error-codes";

describe("dynamic access control", async () => {
	const ac = createAccessControl({
		project: ["create", "read", "update", "delete"],
		sales: ["create", "read", "update", "delete"],
		...defaultStatements,
	});

	const adminAc = ac.newRole({
		project: ["create", "read", "update", "delete"],
		sales: ["create", "read", "update", "delete"],
		...defaultAdminAc.statements,
	});

	const moderatorAc = ac.newRole({
		project: ["create", "read", "update"],
		sales: ["create", "read"],
		ac: ["create", "read", "update"],
	});

	const userAc = ac.newRole({
		project: ["read"],
		sales: ["read"],
		...defaultUserAc.statements,
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

	const { auth, customFetchImpl, signInWithTestUser, signInWithUser } =
		await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
				},
				databaseHooks: {
					user: {
						create: {
							before: async (user) => {
								if (user.name === "Admin") {
									return {
										data: {
											...user,
											role: "admin",
										},
									};
								}
							},
						},
					},
				},
				plugins: [
					admin({
						ac,
						roles: {
							admin: adminAc,
							moderator: moderatorAc,
							user: userAc,
						},
						dynamicAccessControl: {
							enabled: true,
						},
						schema: {
							role: {
								modelName: "role",
								additionalFields,
							},
						},
					}),
				],
			},
			{ testUser: { name: "Admin" } },
		);

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [
			adminClient({
				ac,
				roles: {
					admin: adminAc,
					moderator: moderatorAc,
					user: userAc,
				},
				dynamicAccessControl: {
					enabled: true,
				},
				schema: {
					role: {
						additionalFields,
					},
				},
			}),
		],
		fetchOptions: {
			customFetchImpl,
		},
	});

	const {
		headers: adminHeaders,
		user: adminUser,
		session,
	} = await signInWithTestUser();

	const moderator = {
		id: "456",
		email: "moderator@test.com",
		password: "password",
		name: "Moderator",
	};
	const { data: moderatorRes } = await client.signUp.email(moderator);
	moderator.id = moderatorRes?.user.id || "";
	const { headers: moderatorHeaders } = await signInWithUser(
		moderator.email,
		moderator.password,
	);
	await client.admin.setRole(
		{
			role: "moderator",
			userId: moderator.id,
		},
		{ headers: adminHeaders },
	);

	const user = {
		id: "123",
		email: "user@test.com",
		password: "password",
		name: "Test User",
	};
	const { data: userRes } = await client.signUp.email(user);
	user.id = userRes?.user.id || "";
	const { headers } = await signInWithUser(user.email, user.password);

	it("should successfully create a new role", async () => {
		const permission = {
			project: ["create"],
		};
		const testRole = await client.admin.createRole(
			{
				role: "test",
				permission,
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: adminHeaders },
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

		await auth.api.setRole({
			body: {
				userId: user.id,
				role: testRole.data.roleData.role,
			},
			headers: adminHeaders,
		});

		const shouldFail = await auth.api.userHasPermission({
			body: {
				userId: user.id,
				permissions: {
					project: ["delete"],
				},
			},
			headers,
		});
		expect(shouldFail.success).toBe(false);

		const shouldPass = await auth.api.userHasPermission({
			body: {
				userId: user.id,
				permissions: {
					project: ["create"],
				},
			},
			headers,
		});
		expect(shouldPass.success).toBe(true);
	});

	it("should not be allowed to create a role without the right ac resource permissions", async () => {
		const testRole = await client.admin.createRole(
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
		expect(testRole.data).toBeNull();
		expect(testRole.error?.message).toEqual(
			ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
		);
	});

	it("should not be allowed to crate a role with higher permissions than the current role", async () => {
		const testRole = await client.admin.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					sales: ["create", "delete", "create", "update", "read"], // Intentionally duplicate the "create" permission.
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: moderatorHeaders },
		);
		expect(testRole.data).toBeNull();
		if (testRole.data) throw new Error("Test role created");
		expect(testRole.error?.message).toEqual(
			ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
		);
		expect("missingPermissions" in testRole.error).toBe(true);
		if (!("missingPermissions" in testRole.error)) return;
		expect(testRole.error?.missingPermissions).toEqual([
			"sales:delete",
			"sales:update",
		]);
	});

	it("should not be allowed to create a role which is either predefined or already exists in DB", async () => {
		const testRole = await client.admin.createRole(
			{
				role: "admin", // This is a predefined role.
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: adminHeaders },
		);
		expect(testRole.data).toBeNull();
		expect(testRole.error?.message).toEqual(
			ADMIN_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		);

		const testRole2 = await client.admin.createRole(
			{
				role: "test", // This is a role that was created in a previous test.
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: adminHeaders },
		);
		expect(testRole2.data).toBeNull();
		expect(testRole2.error?.message).toEqual(
			ADMIN_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		);
	});

	it("should delete a role by id", async () => {
		const testRole = await client.admin.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: adminHeaders },
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;

		const res = await auth.api.deleteRole({
			body: {
				roleId,
			},
			headers: adminHeaders,
		});
		expect(res).not.toBeNull();
	});

	it("should delete a role by name", async () => {
		const testRole = await client.admin.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: adminHeaders },
		);
		if (!testRole.data) throw testRole.error;
		const roleName = testRole.data.roleData.role;

		const res = await auth.api.deleteRole({
			body: { roleName },
			headers: adminHeaders,
		});
		expect(res).not.toBeNull();
	});

	it("should not be allowed to delete a role without necessary permissions", async () => {
		const testRole = await client.admin.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: adminHeaders },
		);
		if (!testRole.data) throw testRole.error;
		expect(
			auth.api.deleteRole({
				body: { roleName: testRole.data.roleData.role },
				headers,
			}),
		).rejects.toThrow(ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE);
	});

	it("should not be allowed to delete a role that doesn't exist", async () => {
		try {
			const res = await auth.api.deleteRole({
				body: { roleName: "non-existent-role" },
				headers: adminHeaders,
			});
			expect(res).toBeNull();
		} catch (error: any) {
			if ("body" in error && "message" in error.body) {
				expect(error.body.message).toBe(ADMIN_ERROR_CODES.ROLE_NOT_FOUND);
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
		await client.admin.createRole(
			{
				role: "list-test-role",
				permission,
				additionalFields: {
					color: "#123",
				},
			},
			{ headers: adminHeaders },
		);

		const res = await auth.api.listRoles({ headers: adminHeaders });
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
		expect(auth.api.listRoles({ headers })).rejects.toThrow(
			ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE,
		);
	});

	it("should get a role by id", async () => {
		const testRole = await client.admin.createRole(
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
				headers: adminHeaders,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;
		const res = await auth.api.getRole({
			query: {
				roleId,
			},
			headers: adminHeaders,
		});
		expect(res).not.toBeNull();
		expect(res.role).toBe(testRole.data.roleData.role);
		expect(res.permission).toEqual(testRole.data.roleData.permission);
		expect(res.color).toBe("#000000");
		expectTypeOf(res.color).toEqualTypeOf<string>();
	});

	it("should get a role by name", async () => {
		const testRole = await client.admin.createRole(
			{
				role: `read-test-role-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: adminHeaders },
		);
		if (!testRole.data) throw testRole.error;
		const roleName = testRole.data.roleData.role;

		const res = await auth.api.getRole({
			query: {
				roleName,
			},
			headers: adminHeaders,
		});
		expect(res).not.toBeNull();
		expect(res.role).toBe(testRole.data.roleData.role);
		expect(res.permission).toEqual(testRole.data.roleData.permission);
		expect(res.color).toBe("#000000");
		expectTypeOf(res.color).toEqualTypeOf<string>();
	});

	it("should update a role's permission by id", async () => {
		const testRole = await client.admin.createRole(
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
				headers: adminHeaders,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;
		const res = await auth.api.updateRole({
			body: {
				roleId,
				data: { permission: { project: ["create", "delete"] } },
			},
			headers: adminHeaders,
		});
		expect(res).not.toBeNull();
		expect(res.roleData.role).toBe(testRole.data.roleData.role);
		expect(res.roleData.permission).toEqual({ project: ["create", "delete"] });
	});

	it("should update a role's name by name", async () => {
		const testRole = await client.admin.createRole(
			{
				role: `test-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: adminHeaders },
		);
		if (!testRole.data) throw testRole.error;
		const roleName = testRole.data.roleData.role;

		const res = await auth.api.updateRole({
			body: { roleName, data: { roleName: `updated-${roleName}` } },
			headers: adminHeaders,
		});
		expect(res).not.toBeNull();
		expect(res.roleData.role).toBe(`updated-${roleName}`);

		const res2 = await auth.api.getRole({
			query: {
				roleName: `updated-${roleName}`,
			},
			headers: adminHeaders,
		});
		expect(res2).not.toBeNull();
		expect(res2.role).toBe(`updated-${roleName}`);
	});

	it("should not be allowed to update a role without the right ac resource permissions", async () => {
		const testRole = await client.admin.createRole(
			{
				role: `update-not-allowed-${crypto.randomUUID()}`,
				permission: {
					project: ["create"],
				},
				additionalFields: {
					color: "#000000",
				},
			},
			{ headers: adminHeaders },
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;
		await expect(
			auth.api.updateRole({
				body: {
					roleId,
					data: { roleName: `updated-${testRole.data.roleData.role}` },
				},
				headers,
			}),
		).rejects.toThrow();
	});

	it("should be able to update additional fields", async () => {
		const testRole = await client.admin.createRole(
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
				headers: adminHeaders,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.roleData.id;
		const res = await auth.api.updateRole({
			body: { roleId, data: { color: "#111111" } },
			headers: adminHeaders,
		});
		expect(res).not.toBeNull();
		expect(res.roleData.color).toBe("#111111");
		//@ts-expect-error - intentionally invalid key
		expect(res.roleData.someInvalidKey).toBeUndefined();
	});
});
