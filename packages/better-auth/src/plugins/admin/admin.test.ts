import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin, type UserWithRole } from "./admin";
import { adminClient } from "./client";
import { createAccessControl } from "../access";
import { createAuthClient } from "../../client";

describe("Admin plugin", async () => {
	const { signInWithTestUser, signInWithUser, cookieSetter, customFetchImpl } =
		await getTestInstance(
			{
				plugins: [admin()],
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
			},
			{
				testUser: {
					name: "Admin",
				},
			},
		);
	const client = createAuthClient({
		fetchOptions: {
			customFetchImpl,
		},
		plugins: [adminClient()],
		baseURL: "http://localhost:3000",
	});

	const { headers: adminHeaders } = await signInWithTestUser();
	let newUser: UserWithRole | undefined;

	it("should allow admin to create users", async () => {
		const res = await client.admin.createUser(
			{
				name: "Test User",
				email: "test2@test.com",
				password: "test",
				role: "user",
			},
			{
				headers: adminHeaders,
			},
		);
		newUser = res.data?.user;
		expect(newUser?.role).toBe("user");
	});

	it("should allow admin to list users", async () => {
		const res = await client.admin.listUsers({
			query: {
				limit: 2,
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res.data?.users.length).toBe(2);
	});

	it("should allow admin to count users", async () => {
		const res = await client.admin.listUsers({
			query: {
				limit: 2,
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res.data?.total).toBe(2);
	});

	it("should allow to sort users by name", async () => {
		const res = await client.admin.listUsers({
			query: {
				sortBy: "name",
				sortDirection: "desc",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});

		expect(res.data?.users[0].name).toBe("Test User");

		const res2 = await client.admin.listUsers({
			query: {
				sortBy: "name",
				sortDirection: "asc",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res2.data?.users[0].name).toBe("Admin");
	});

	it("should allow offset and limit", async () => {
		const res = await client.admin.listUsers({
			query: {
				limit: 1,
				offset: 1,
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res.data?.users.length).toBe(1);
		expect(res.data?.users[0].name).toBe("Test User");
	});

	it("should allow to search users by name", async () => {
		const res = await client.admin.listUsers({
			query: {
				searchValue: "Admin",
				searchField: "name",
				searchOperator: "contains",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res.data?.users.length).toBe(1);
	});

	it("should allow to filter users by role", async () => {
		const res = await client.admin.listUsers({
			query: {
				filterValue: "admin",
				filterField: "role",
				filterOperator: "eq",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res.data?.users.length).toBe(1);
	});

	it("should allow to set user role", async () => {
		const res = await client.admin.setRole(
			{
				userId: newUser?.id || "",
				role: "admin",
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.data?.user?.role).toBe("admin");
	});

	it("should allow to ban user", async () => {
		const res = await client.admin.banUser(
			{
				userId: newUser?.id || "",
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.data?.user?.banned).toBe(true);
	});

	it("should allow to ban user with reason and expiration", async () => {
		const res = await client.admin.banUser(
			{
				userId: newUser?.id || "",
				banReason: "Test reason",
				banExpiresIn: 60 * 60 * 24,
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.data?.user?.banned).toBe(true);
		expect(res.data?.user?.banReason).toBe("Test reason");
		expect(res.data?.user?.banExpires).toBeDefined();
	});

	it("should not allow banned user to sign in", async () => {
		const res = await client.signIn.email({
			email: newUser?.email || "",
			password: "test",
		});
		expect(res.error?.status).toBe(401);
	});

	it("should allow banned user to sign in if ban expired", async () => {
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(60 * 60 * 24 * 1000);
		const res = await client.signIn.email({
			email: newUser?.email || "",
			password: "test",
		});
		expect(res.data?.user).toBeDefined();
	});

	it("should allow to unban user", async () => {
		const res = await client.admin.unbanUser(
			{
				userId: newUser?.id || "",
			},
			{
				headers: adminHeaders,
			},
		);

		expect(res.data?.user?.banned).toBe(false);
		expect(res.data?.user?.banExpires).toBeNull();
		expect(res.data?.user?.banReason).toBeNull();
	});

	it("should allow admin to list user sessions", async () => {
		const res = await client.admin.listUserSessions(
			{
				userId: newUser?.id || "",
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.data?.sessions.length).toBe(1);
	});

	const data = {
		email: "impersonate@mail.com",
		password: "password",
		name: "Impersonate User",
	};

	const impersonateHeaders = new Headers();
	it("should allow admins to impersonate user", async () => {
		const userToImpersonate = await client.signUp.email(data);
		const session = await client.getSession({
			fetchOptions: {
				headers: new Headers({
					Authorization: `Bearer ${userToImpersonate.data?.token}`,
				}),
			},
		});
		const res = await client.admin.impersonateUser(
			{
				userId: session.data?.user.id || "",
			},
			{
				headers: adminHeaders,
				onSuccess: (ctx) => {
					cookieSetter(impersonateHeaders)(ctx);
				},
			},
		);
		expect(res.data?.session).toBeDefined();
		expect(res.data?.user?.id).toBe(session.data?.user.id);
	});

	it("should filter impersonated sessions", async () => {
		const { headers } = await signInWithUser(data.email, data.password);
		const res = await client.listSessions({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data?.length).toBe(2);
	});

	it("should allow admin to stop impersonating", async () => {
		const impersonatedUserRes = await client.admin.listUsers({
			fetchOptions: {
				headers: impersonateHeaders,
			},
			query: {
				filterField: "role",
				filterOperator: "eq",
				filterValue: "admin",
			},
		});
		//should reject cause the user is not admin
		expect(impersonatedUserRes.error?.status).toBe(403);
		const res = await client.admin.stopImpersonating(
			{},
			{
				headers: impersonateHeaders,
				onSuccess: (ctx) => {
					cookieSetter(impersonateHeaders)(ctx);
				},
			},
		);
		expect(res.data?.session).toBeDefined();

		const afterStopImpersonationRes = await client.admin.listUsers({
			fetchOptions: {
				headers: impersonateHeaders,
			},
			query: {
				filterField: "role",
				filterOperator: "eq",
				filterValue: "admin",
			},
		});
		expect(afterStopImpersonationRes.data?.users.length).toBeGreaterThan(1);
	});

	it("should allow admin to revoke user session", async () => {
		const {
			res: { user },
		} = await signInWithUser(data.email, data.password);
		const sessions = await client.admin.listUserSessions(
			{
				userId: user.id,
			},
			{
				headers: adminHeaders,
			},
		);
		expect(sessions.data?.sessions.length).toBe(4);
		const res = await client.admin.revokeUserSession(
			{ sessionToken: sessions.data?.sessions[0].token || "" },
			{ headers: adminHeaders },
		);
		expect(res.data?.success).toBe(true);
		const sessions2 = await client.admin.listUserSessions(
			{ userId: user?.id || "" },
			{ headers: adminHeaders },
		);
		expect(sessions2.data?.sessions.length).toBe(3);
	});

	it("should allow admin to revoke user sessions", async () => {
		const res = await client.admin.revokeUserSessions(
			{ userId: newUser?.id || "" },
			{ headers: adminHeaders },
		);
		expect(res.data?.success).toBe(true);
		const sessions2 = await client.admin.listUserSessions(
			{ userId: newUser?.id || "" },
			{ headers: adminHeaders },
		);
		expect(sessions2.data?.sessions.length).toBe(0);
	});

	it("should list with me", async () => {
		const response = await client.admin.listUsers({
			query: {
				sortBy: "createdAt",
				sortDirection: "desc",
				filterField: "role",
				filterOperator: "ne",
				filterValue: "user",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(response.data?.users.length).toBe(2);
		const roles = response.data?.users.map((d) => d.role);
		expect(roles).not.toContain("user");
	});

	it("should allow admin to delete user", async () => {
		const res = await client.admin.removeUser(
			{
				userId: newUser?.id || "",
			},
			{
				headers: adminHeaders,
			},
		);

		expect(res.data?.success).toBe(true);
	});
});

describe("access control", async (it) => {
	const ac = createAccessControl({
		user: ["create", "read", "update", "delete"],
		order: ["create", "read", "update", "delete", "update-many"],
	});

	const adminAc = ac.newRole({
		user: ["create", "read", "update", "delete"],
		order: ["create", "read", "update", "delete"],
	});
	const userAc = ac.newRole({
		user: ["read"],
		order: ["read"],
	});

	const { signInWithTestUser, signInWithUser, cookieSetter, auth } =
		await getTestInstance(
			{
				plugins: [
					admin({
						ac,
						roles: {
							admin: adminAc,
							user: userAc,
						},
					}),
				],
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
			},
			{
				testUser: {
					name: "Admin",
				},
			},
		);

	const client = createAuthClient({
		plugins: [
			adminClient({
				ac,
				roles: {
					admin: adminAc,
					user: userAc,
				},
			}),
		],
	});

	const { headers, user } = await signInWithTestUser();

	it("should validate on the client", async () => {
		const canCreateOrder = client.admin.checkRolePermission({
			role: "admin",
			permission: {
				order: ["create"],
			},
		});
		expect(canCreateOrder).toBe(true);

		const canCreateUser = client.admin.checkRolePermission({
			role: "user",
			permission: {
				user: ["create"],
			},
		});
		expect(canCreateUser).toBe(false);
	});

	it("should validate using userId", async () => {
		const canCreateUser = await auth.api.userHasPermission({
			body: {
				userId: user.id,
				permission: {
					user: ["create"],
				},
			},
		});
		expect(canCreateUser.success).toBe(true);
		const canUpdateManyOrder = await auth.api.userHasPermission({
			body: {
				userId: user.id,
				permission: {
					order: ["update-many"],
				},
			},
		});
		expect(canUpdateManyOrder.success).toBe(false);
	});

	it("should validate using role", async () => {
		const canCreateUser = await auth.api.userHasPermission({
			body: {
				role: "admin",
				permission: {
					user: ["create"],
				},
			},
		});
		expect(canCreateUser.success).toBe(true);
		const canUpdateOrder = await auth.api.userHasPermission({
			body: {
				role: "user",
				permission: {
					order: ["update"],
				},
			},
		});
		expect(canUpdateOrder.success).toBe(false);
	});
});
