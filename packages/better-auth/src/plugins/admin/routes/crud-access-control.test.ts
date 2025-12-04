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
	});
});
