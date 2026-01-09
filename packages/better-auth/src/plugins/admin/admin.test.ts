import { BetterAuthError } from "@better-auth/core/error";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { createAuthClient } from "../../client";
import { signJWT } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { createAccessControl } from "../access";
import { admin } from "./admin";
import { ADMIN_ERROR_CODES, adminClient } from "./client";
import type { UserWithRole } from "./types";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	const data: GoogleProfile = {
		email: "user@email.com",
		email_verified: true,
		name: "First Last",
		picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
		exp: 1234567890,
		sub: "1234567890",
		iat: 1234567890,
		aud: "test",
		azp: "test",
		nbf: 1234567890,
		iss: "test",
		locale: "en",
		jti: "test",
		given_name: "First",
		family_name: "Last",
	};
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
			return HttpResponse.json({
				access_token: "test",
				refresh_token: "test",
				id_token: testIdToken,
			});
		}),
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("Admin plugin", async () => {
	const {
		auth,
		signInWithTestUser,
		signInWithUser,
		cookieSetter,
		customFetchImpl,
	} = await getTestInstance(
		{
			plugins: [
				admin({
					bannedUserMessage: "Custom banned user message",
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
		fetchOptions: {
			customFetchImpl,
		},
		plugins: [adminClient()],
		baseURL: "http://localhost:3000",
	});

	const { headers: adminHeaders } = await signInWithTestUser();
	let newUser: UserWithRole | undefined;
	const testNonAdminUser = {
		id: "123",
		email: "user@test.com",
		password: "password",
		name: "Test User",
	};
	const { data: testNonAdminUserRes } =
		await client.signUp.email(testNonAdminUser);
	testNonAdminUser.id = testNonAdminUserRes?.user.id || "";
	const { headers: userHeaders } = await signInWithUser(
		testNonAdminUser.email,
		testNonAdminUser.password,
	);

	it("should allow admin to get user", async () => {
		const res = await client.admin.getUser(
			{
				query: {
					id: testNonAdminUser.id,
				},
			},
			{
				headers: adminHeaders,
			},
		);

		expect(res.data?.email).toBe(testNonAdminUser.email);
	});

	it("should not allow non-admin to get user", async () => {
		const res = await client.admin.getUser(
			{
				query: {
					id: testNonAdminUser.id,
				},
			},
			{
				headers: userHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
		expect(res.error?.code).toBe("YOU_ARE_NOT_ALLOWED_TO_GET_USER");
	});

	it("should allow admin to create users", async () => {
		const res = await client.admin.createUser(
			{
				name: "Test User",
				email: "user@email.com",
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

	it("should allow admin to create user with multiple roles", async () => {
		const res = await client.admin.createUser(
			{
				name: "Test User mr",
				email: "testmr@test.com",
				password: "test",
				role: ["user", "admin"],
			},
			{
				headers: adminHeaders,
			},
		);
		const result = await client.admin.listUsers({
			query: {
				filterField: "role",
				filterOperator: "contains",
				filterValue: "admin",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(result.data?.users.length).toBe(2);
		expect(res.data?.user.role).toBe("user,admin");
		await client.admin.removeUser(
			{
				userId: res.data?.user.id || "",
			},
			{
				headers: adminHeaders,
			},
		);
	});

	it("should not allow non-admin to create users", async () => {
		const res = await client.admin.createUser(
			{
				name: "Test User",
				email: "test2@test.com",
				password: "test",
				role: "user",
			},
			{
				headers: userHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
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

	it("should list users with search query", async () => {
		const res = await client.admin.listUsers({
			query: {
				filterField: "role",
				filterOperator: "eq",
				filterValue: "admin",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res.data?.total).toBe(1);
	});

	it("should not allow non-admin to list users", async () => {
		const res = await client.admin.listUsers({
			query: {
				limit: 2,
			},
			fetchOptions: {
				headers: userHeaders,
			},
		});
		expect(res.error?.status).toBe(403);
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
		expect(res.data?.users.length).toBe(2);
		expect(res.data?.total).toBe(3);
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

		expect(res.data?.users[0]!.name).toBe("Test User");

		const res2 = await client.admin.listUsers({
			query: {
				sortBy: "name",
				sortDirection: "asc",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res2.data?.users[0]!.name).toBe("Admin");
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
		expect(res.data?.users[0]!.name).toBe("Test User");
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
		await client.admin.listUsers({
			query: {
				filterValue: "admin",
				filterField: "role",
				filterOperator: "eq",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
	});

	it("should filter users by id with ne operator", async () => {
		const allUsers = await client.admin.listUsers({
			query: {},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		const firstUserId = allUsers.data?.users[0]!.id;

		const res = await client.admin.listUsers({
			query: {
				filterValue: firstUserId,
				filterField: "id",
				filterOperator: "ne",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});

		expect(res.data?.users.length).toBe(allUsers.data!.total - 1);
		expect(res.data?.users.every((u) => u.id !== firstUserId)).toBe(true);
	});

	it("should filter users by _id with ne operator", async () => {
		const allUsers = await client.admin.listUsers({
			query: {},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		const firstUserId = allUsers.data?.users[0]!.id;

		const res = await client.admin.listUsers({
			query: {
				filterValue: firstUserId,
				filterField: "_id",
				filterOperator: "ne",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});

		expect(res.data?.users.length).toBe(allUsers.data!.total - 1);
		expect(res.data?.users.every((u) => u.id !== firstUserId)).toBe(true);
	});

	it("should allow to combine search and filter", async () => {
		const res = await client.admin.listUsers({
			query: {
				filterValue: "admin",
				filterField: "role",
				filterOperator: "eq",
				searchValue: "test",
				searchField: "email",
				searchOperator: "contains",
			},
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		expect(res.data?.users.length).toBe(1);
		expect(res.data?.users[0]!.email).toBe("test@test.com");
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

	it("should allow to set multiple user roles", async () => {
		const createdUser = await client.admin.createUser(
			{
				name: "Test User mr",
				email: "testmr@test.com",
				password: "test",
				role: "user",
			},
			{
				headers: adminHeaders,
			},
		);
		expect(createdUser.data?.user.role).toBe("user");
		const res = await client.admin.setRole(
			{
				userId: createdUser.data?.user.id || "",
				role: ["user", "admin"],
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.data?.user?.role).toBe("user,admin");
		await client.admin.removeUser(
			{
				userId: createdUser.data?.user.id || "",
			},
			{
				headers: adminHeaders,
			},
		);
	});

	it("should not allow non-admin to set user role", async () => {
		const res = await client.admin.setRole(
			{
				userId: newUser?.id || "",
				role: "admin",
			},
			{
				headers: userHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
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

	it("should not allow non-admin to ban user", async () => {
		const res = await client.admin.banUser(
			{
				userId: newUser?.id || "",
			},
			{
				headers: userHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
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
		expect(res.error?.code).toBe("BANNED_USER");
		expect(res.error?.status).toBe(403);
	});

	it("should not allow banned user to sign in with social provider", async () => {
		const headers = new Headers();
		const res = await client.signIn.social(
			{
				provider: "google",
			},
			{
				throw: true,
				onSuccess: cookieSetter(headers),
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		let errorLocation: string | null = null;
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				errorLocation = location;
			},
		});
		expect(errorLocation).toBeDefined();
		expect(errorLocation).toContain("error=banned");
	});

	it("should change banned user message", async () => {
		const res = await client.signIn.email({
			email: newUser?.email || "",
			password: "test",
		});
		expect(res.error?.message).toBe("Custom banned user message");
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

	it("should not allow non-admin to unban user", async () => {
		const res = await client.admin.unbanUser(
			{
				userId: newUser?.id || "",
			},
			{
				headers: userHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
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

	it("should not allow non-admin to list user sessions", async () => {
		const res = await client.admin.listUserSessions(
			{
				userId: newUser?.id || "",
			},
			{
				headers: userHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
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

	it("should not allow non-admin to impersonate user", async () => {
		const res = await client.admin.impersonateUser(
			{
				userId: newUser?.id || "",
			},
			{
				headers: userHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
	});

	it("should not allow to impersonate admins", async () => {
		const userToImpersonate = await client.signUp.email({
			email: "impersonate-admin@mail.com",
			password: "password",
			name: "Impersonate Admin User",
		});
		const userId = userToImpersonate.data?.user.id || "";
		await client.admin.setRole({
			userId,
			role: "admin",
			fetchOptions: {
				headers: adminHeaders,
			},
		});
		const res = await client.admin.impersonateUser(
			{
				userId,
			},
			{ headers: adminHeaders },
		);

		expect(res.error?.status).toBe(403);
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
		expect(sessions.data?.sessions.length).toBe(3);
		const res = await client.admin.revokeUserSession(
			{ sessionToken: sessions.data?.sessions[0]!.token || "" },
			{ headers: adminHeaders },
		);
		expect(res.data?.success).toBe(true);
		const sessions2 = await client.admin.listUserSessions(
			{ userId: user?.id || "" },
			{ headers: adminHeaders },
		);
		expect(sessions2.data?.sessions.length).toBe(2);
	});

	it("should not allow non-admin to revoke user sessions", async () => {
		const res = await client.admin.revokeUserSessions(
			{ userId: newUser?.id || "" },
			{ headers: userHeaders },
		);
		expect(res.error?.status).toBe(403);
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
		expect(response.data?.users.length).toBeGreaterThanOrEqual(2);
		const roles = response.data?.users.map((d) => d.role);
		expect(roles).not.toContain("user");
	});

	it("should allow admin to set user password", async () => {
		const res = await client.admin.setUserPassword(
			{
				userId: newUser?.id || "",
				newPassword: "newPassword",
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.data?.status).toBe(true);
		const res2 = await client.signIn.email({
			email: newUser?.email || "",
			password: "newPassword",
		});
		expect(res2.data?.user).toBeDefined();
	});
	it("should not allow admin to set user password with empty userId", async () => {
		const res = await client.admin.setUserPassword(
			{
				userId: "",
				newPassword: "newPassword",
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.error?.status).toBe(400);
	});

	it("should not allow admin to set user password with empty new password", async () => {
		const res = await client.admin.setUserPassword(
			{
				userId: newUser?.id || "",
				newPassword: "",
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.error?.status).toBe(400);
	});

	it("should not allow admin to set user password with a short new password", async () => {
		const res = await client.admin.setUserPassword(
			{
				userId: newUser!.id,
				newPassword: "1234567",
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("PASSWORD_TOO_SHORT");
		expect(res.error?.message).toBe("Password too short");
	});

	it("should not allow admin to set user password with a long new password", async () => {
		const longNewPassword = Array(129).fill("a").join("");
		const res = await client.admin.setUserPassword(
			{
				userId: newUser!.id,
				newPassword: longNewPassword,
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("PASSWORD_TOO_LONG");
		expect(res.error?.message).toBe("Password too long");
	});

	it("should not allow non-admin to set user password", async () => {
		const res = await client.admin.setUserPassword(
			{
				userId: newUser?.id || "",
				newPassword: "newPassword",
			},
			{
				headers: userHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
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

	it("should not allow non-admin to delete user", async () => {
		const res = await client.admin.removeUser(
			{ userId: newUser?.id || "" },
			{ headers: userHeaders },
		);
		expect(res.error?.status).toBe(403);
	});

	it("should allow creating users from server", async () => {
		const res = await auth.api.createUser({
			body: {
				email: "test2@test.com",
				password: "password",
				name: "Test User",
			},
		});
		expect(res.user).toMatchObject({
			email: "test2@test.com",
			name: "Test User",
			role: "user",
		});
	});

	it("should allow admin to update user", async () => {
		const res = await client.admin.updateUser(
			{
				userId: testNonAdminUser.id,
				data: {
					name: "Updated Name",
					customField: "custom value",
					role: ["member", "user"],
				},
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.data?.name).toBe("Updated Name");
		expect(res.data?.role).toBe("member,user");
	});

	it("should not allow non-admin to update user", async () => {
		const res = await client.admin.updateUser(
			{
				userId: testNonAdminUser.id,
				data: {
					name: "Unauthorized Update",
				},
			},
			{
				headers: userHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
		expect(res.error?.code).toBe("YOU_ARE_NOT_ALLOWED_TO_UPDATE_USERS");
	});
});

describe("access control", async (it) => {
	const ac = createAccessControl({
		user: [
			"create",
			"read",
			"update",
			"delete",
			"list",
			"bulk-delete",
			"set-role",
		],
		order: ["create", "read", "update", "delete", "update-many"],
	});

	const adminAc = ac.newRole({
		user: ["create", "read", "update", "delete", "list", "set-role"],
		order: ["create", "read", "update", "delete"],
	});
	const userAc = ac.newRole({
		user: ["read"],
		order: ["read"],
	});
	const supportAc = ac.newRole({
		user: ["update"],
		order: ["update"],
	});

	const { signInWithTestUser, cookieSetter, auth, customFetchImpl } =
		await getTestInstance(
			{
				plugins: [
					admin({
						ac,
						roles: {
							admin: adminAc,
							user: userAc,
							support: supportAc,
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
								if (user.name === "Support") {
									return {
										data: {
											...user,
											role: "support",
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
					support: supportAc,
				},
			}),
		],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	const { headers, user } = await signInWithTestUser();

	it("should not allow role updates via update-user without user:set-role", async () => {
		const supportHeaders = new Headers();
		const { data: supportSignUp } = await client.signUp.email(
			{
				email: "support@test.com",
				password: "password",
				name: "Support",
			},
			{
				onSuccess: cookieSetter(supportHeaders),
			},
		);
		const supportUserId = supportSignUp?.user.id || "";

		// Non-sensitive updates should still be allowed with `user:update`
		const ok = await client.admin.updateUser(
			{
				userId: supportUserId,
				data: {
					name: "Support Updated",
				},
			},
			{
				headers: supportHeaders,
			},
		);
		expect(ok.data?.name).toBe("Support Updated");

		// But attempting to update `role` must be rejected without `user:set-role`.
		const res = await client.admin.updateUser(
			{
				userId: supportUserId,
				data: {
					role: "admin",
				},
			},
			{
				headers: supportHeaders,
			},
		);
		expect(res.error?.status).toBe(403);
	});

	it("should reject non-existent roles via update-user", async () => {
		const { data: targetUserRes } = await client.signUp.email(
			{
				email: "role-target@test.com",
				password: "password",
				name: "Role Target",
			},
			{
				onSuccess: cookieSetter(new Headers()),
			},
		);
		const targetUserId = targetUserRes?.user.id || "";

		const res = await client.admin.updateUser(
			{
				userId: targetUserId,
				data: {
					role: "non-existent-role",
				},
			},
			{
				headers,
			},
		);
		expect(res.error?.status).toBe(400);
	});

	it("should allow role updates via update-user for valid roles with user:set-role", async () => {
		const { data: targetUserRes } = await client.signUp.email(
			{
				email: "role-valid-target@test.com",
				password: "password",
				name: "Role Valid Target",
			},
			{
				onSuccess: cookieSetter(new Headers()),
			},
		);
		const targetUserId = targetUserRes?.user.id || "";

		const res = await client.admin.updateUser(
			{
				userId: targetUserId,
				data: {
					role: "support",
				},
			},
			{
				headers,
			},
		);
		expect(res.error).toBeNull();
		expect(res.data?.role).toBe("support");
	});

	it("should validate on the client", async () => {
		const canCreateOrder = client.admin.checkRolePermission({
			role: "admin",
			permissions: {
				order: ["create"],
			},
		});
		expect(canCreateOrder).toBe(true);

		// To be removed when `permission` will be removed entirely
		const canCreateOrderLegacy = client.admin.checkRolePermission({
			role: "admin",
			permission: {
				order: ["create"],
				user: ["read"],
			},
		});
		expect(canCreateOrderLegacy).toBe(true);

		const canCreateOrderAndReadUser = client.admin.checkRolePermission({
			role: "admin",
			permissions: {
				order: ["create"],
				user: ["read"],
			},
		});
		expect(canCreateOrderAndReadUser).toBe(true);

		const canCreateUser = client.admin.checkRolePermission({
			role: "user",
			permissions: {
				user: ["create"],
			},
		});
		expect(canCreateUser).toBe(false);

		const canCreateOrderAndCreateUser = client.admin.checkRolePermission({
			role: "user",
			permissions: {
				order: ["create"],
				user: ["create"],
			},
		});
		expect(canCreateOrderAndCreateUser).toBe(false);
	});

	it("should validate using userId", async () => {
		const canCreateUser = await auth.api.userHasPermission({
			body: {
				userId: user.id,
				permissions: {
					user: ["create"],
				},
			},
		});
		expect(canCreateUser.success).toBe(true);

		const canCreateUserAndCreateOrder = await auth.api.userHasPermission({
			body: {
				userId: user.id,
				permissions: {
					user: ["create"],
					order: ["create"],
				},
			},
		});
		expect(canCreateUserAndCreateOrder.success).toBe(true);

		const canUpdateManyOrder = await auth.api.userHasPermission({
			body: {
				userId: user.id,
				permissions: {
					order: ["update-many"],
				},
			},
		});
		expect(canUpdateManyOrder.success).toBe(false);

		const canUpdateManyOrderAndBulkDeleteUser =
			await auth.api.userHasPermission({
				body: {
					userId: user.id,
					permissions: {
						user: ["bulk-delete"],
						order: ["update-many"],
					},
				},
			});
		expect(canUpdateManyOrderAndBulkDeleteUser.success).toBe(false);
	});

	it("should validate using role", async () => {
		const canCreateUser = await auth.api.userHasPermission({
			body: {
				role: "admin",
				permissions: {
					user: ["create"],
				},
			},
		});
		expect(canCreateUser.success).toBe(true);

		const canCreateUserAndCreateOrder = await auth.api.userHasPermission({
			body: {
				role: "admin",
				permissions: {
					user: ["create"],
					order: ["create"],
				},
			},
		});
		expect(canCreateUserAndCreateOrder.success).toBe(true);

		const canUpdateOrder = await auth.api.userHasPermission({
			body: {
				role: "user",
				permissions: {
					order: ["update"],
				},
			},
		});
		expect(canUpdateOrder.success).toBe(false);

		const canUpdateOrderAndUpdateUser = await auth.api.userHasPermission({
			body: {
				role: "user",
				permissions: {
					order: ["update"],
					user: ["update"],
				},
			},
		});
		expect(canUpdateOrderAndUpdateUser.success).toBe(false);
	});

	it("should prioritize role over userId when both are provided", async () => {
		const testUser = await client.signUp.email({
			email: "rolepriority@test.com",
			password: "password",
			name: "Role Priority Test User",
		});
		const userId = testUser.data?.user.id;

		const checkWithAdminRole = await auth.api.userHasPermission({
			body: {
				userId: userId, // non-admin user ID
				role: "admin", // admin role
				permission: {
					user: ["create"],
				},
			},
		});
		expect(checkWithAdminRole.success).toBe(true);

		const checkWithUserRole = await auth.api.userHasPermission({
			body: {
				userId: userId, // non-admin user ID
				role: "user", // user role
				permission: {
					user: ["create"],
				},
			},
		});
		expect(checkWithUserRole.success).toBe(false);
	});

	it("should check permissions correctly for banned user with role provided", async () => {
		const bannedUser = await client.signUp.email({
			email: "bannedwithRole@test.com",
			password: "password",
			name: "Banned Role Test User",
		});
		const bannedUserId = bannedUser.data?.user.id;

		await client.admin.banUser(
			{
				userId: bannedUserId || "",
				banReason: "Testing role priority",
			},
			{
				headers: headers,
			},
		);

		const checkWithRole = await auth.api.userHasPermission({
			body: {
				userId: bannedUserId, // banned user ID
				role: "admin", // admin role
				permission: {
					user: ["create"],
				},
			},
		});
		expect(checkWithRole.success).toBe(true);

		const checkWithoutRole = await auth.api.userHasPermission({
			body: {
				userId: bannedUserId, // banned user ID only
				permission: {
					user: ["create"],
				},
			},
		});
		expect(checkWithoutRole.success).toBe(false); // User doesn't have admin permissions

		await client.admin.unbanUser(
			{
				userId: bannedUserId || "",
			},
			{
				headers: headers,
			},
		);
	});

	it("shouldn't allow to list users", async () => {
		const { headers } = await signInWithTestUser();
		const adminRes = await client.admin.listUsers({
			query: {
				limit: 10,
			},
			fetchOptions: {
				headers,
			},
		});
		// The exact count may vary based on users created in previous tests
		const adminCount = adminRes.data?.users.length || 0;
		expect(adminCount).toBeGreaterThan(0); // Should have at least the admin user

		const userHeaders = new Headers();
		await client.signUp.email(
			{
				email: "test2@test.com",
				password: "password",
				name: "Test User",
			},
			{
				onSuccess: cookieSetter(userHeaders),
			},
		);
		const userRes = await client.admin.listUsers({
			query: {
				limit: 2,
			},
			fetchOptions: {
				headers: userHeaders,
			},
		});
		expect(userRes.error?.status).toBe(403);
	});

	it("should not allow to set multiple non existent user role", async () => {
		const createdUser = await client.admin.createUser(
			{
				name: "Test User mr",
				email: "testmr@test.com",
				password: "test",
				role: ["user"],
			},
			{
				headers: headers,
			},
		);
		expect(createdUser.data?.user.role).toBe("user");
		const res = await client.admin.setRole(
			{
				userId: createdUser.data?.user.id || "",
				role: ["user", "non-user"] as any[],
			},
			{ headers: headers },
		);
		expect(res.error).toBeDefined();
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe(
			ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE.code,
		);
		await client.admin.removeUser(
			{ userId: createdUser.data?.user.id || "" },
			{ headers: headers },
		);
	});

	it("should not allow to set non existent user role", async () => {
		const createdUser = await client.admin.createUser(
			{
				name: "Test User mr",
				email: "testmr@test.com",
				password: "test",
				role: "user",
			},
			{
				headers: headers,
			},
		);
		expect(createdUser.data?.user.role).toBe("user");
		const res = await client.admin.setRole(
			{
				userId: createdUser.data?.user.id || "",
				role: "non-user" as any,
			},
			{ headers: headers },
		);
		expect(res.error).toBeDefined();
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe(
			ADMIN_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE.code,
		);
		await client.admin.removeUser(
			{ userId: createdUser.data?.user.id || "" },
			{ headers: headers },
		);
	});

	it("should throw error when assigning non-existent admin roles", async () => {
		expect(() =>
			admin({
				adminRoles: ["non-existent-role"],
			}),
		).toThrowError(BetterAuthError);
	});

	it("should properly type custom roles in createUser", async () => {
		const createdUser = await client.admin.createUser(
			{
				name: "Test User with Support Role",
				email: "support-role@test.com",
				password: "test",
				role: "support", // This should be accepted as "support" is a custom role
			},
			{
				headers: headers,
			},
		);
		expect(createdUser.data?.user.role).toBe("support");
		await client.admin.removeUser(
			{ userId: createdUser.data?.user.id || "" },
			{ headers: headers },
		);
	});
});

describe("edge cases: userId validation", async () => {
	const { signInWithTestUser, customFetchImpl, auth } = await getTestInstance(
		{
			advanced: {
				database: {
					useNumberId: true,
				},
			},
			plugins: [
				admin({
					bannedUserMessage: "Custom banned user message",
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
		fetchOptions: {
			customFetchImpl,
		},
		plugins: [adminClient()],
		baseURL: "http://localhost:3000",
	});

	const { headers: adminHeaders } = await signInWithTestUser();

	it("should allow admin to check permissions with useNumberId", async () => {
		const res = await client.admin.hasPermission(
			{
				role: "admin",
				permissions: {
					user: ["create"],
				},
			},
			{
				headers: adminHeaders,
			},
		);
		expect(res.data?.success).toBe(true);
	});

	it("should return correct error when userId is missing and not call DB with undefined", async () => {
		await expect(
			auth.api.userHasPermission({
				body: {
					permissions: {
						user: ["list"],
					},
				},
			}),
		).rejects.toThrow("user id or role is required");
	});

	it("should return user not found when userId is empty string", async () => {
		await expect(
			auth.api.userHasPermission({
				body: {
					userId: "",
					permissions: {
						user: ["list"],
					},
				},
			}),
		).rejects.toThrow("user id or role is required");
	});

	it("should not crash if userId is 'NaN'", async () => {
		await expect(
			auth.api.userHasPermission({
				body: {
					userId: "NaN",
					permissions: {
						user: ["list"],
					},
				},
			}),
		).rejects.toThrow("user not found");
	});
});

describe("Admin plugin - Events", async () => {
	const {
		auth,
		signInWithTestUser,
		signInWithUser,
		cookieSetter,
		customFetchImpl,
	} = await getTestInstance(
		{
			plugins: [
				admin({
					bannedUserMessage: "Custom banned user message",
					events: {
						impersonateStart: vi.fn(),
						impersonateEnd: vi.fn(),
						ban: vi.fn(),
						unban: vi.fn(),
						userCreate: vi.fn(),
						userRemove: vi.fn(),
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
		fetchOptions: {
			customFetchImpl,
		},
		plugins: [adminClient()],
		baseURL: "http://localhost:3000",
	});

	const { headers: adminHeaders } = await signInWithTestUser();
	const testUser = {
		id: "123",
		email: "eventtest@test.com",
		password: "password",
		name: "Event Test User",
	};
	const { data: testUserRes } = await client.signUp.email(testUser);
	testUser.id = testUserRes?.user.id || "";

	describe("userCreate event", () => {
		it("should call userCreate event when admin creates a user", async () => {
			const mockUserCreate = vi.fn();
			const mockEvents = {
				impersonateStart: vi.fn(),
				impersonateEnd: vi.fn(),
				ban: vi.fn(),
				unban: vi.fn(),
				userCreate: mockUserCreate,
				userRemove: vi.fn(),
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			const res = await clientWithMocks.admin.createUser(
				{
					name: "Created User",
					email: "created@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			expect(res.data?.user).toBeDefined();
			expect(mockUserCreate).toHaveBeenCalled();
			const callArgs = mockUserCreate.mock.calls[0];
			expect(callArgs).toBeDefined();
			expect(callArgs?.[0]).toBeDefined(); // adminSession
			expect(callArgs?.[1]?.email).toBe("created@test.com");
			expect(callArgs?.[1]?.name).toBe("Created User");
		});

		it("should pass null adminSession when creating user from server", async () => {
			const mockUserCreate = vi.fn();
			const mockEvents = {
				impersonateStart: vi.fn(),
				impersonateEnd: vi.fn(),
				ban: vi.fn(),
				unban: vi.fn(),
				userCreate: mockUserCreate,
				userRemove: vi.fn(),
			};

			const { auth: authWithMocks } = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
						}),
					],
				},
				{
					testUser: {
						name: "Admin",
					},
				},
			);

			// Create user directly from server
			const createdUser = await authWithMocks.api.createUser({
				body: {
					email: "servercreated@test.com",
					password: "password123",
					name: "Server Created",
					role: "user",
				},
			});

			expect(createdUser.user).toBeDefined();
			expect(mockUserCreate).toHaveBeenCalled();
			const callArgs = mockUserCreate.mock.calls[0];
			expect(callArgs).toBeDefined();
			expect(callArgs?.[0]).toBeNull(); // adminSession should be null from server
			expect(callArgs?.[1]?.email).toBe("servercreated@test.com");
		});
	});

	describe("userRemove event", () => {
		it("should call userRemove event when admin removes a user", async () => {
			const mockUserRemove = vi.fn();
			const mockEvents = {
				impersonateStart: vi.fn(),
				impersonateEnd: vi.fn(),
				ban: vi.fn(),
				unban: vi.fn(),
				userCreate: vi.fn(),
				userRemove: mockUserRemove,
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			// Create a user first
			const createRes = await clientWithMocks.admin.createUser(
				{
					name: "User to Remove",
					email: "toremove@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			const userId = createRes.data?.user.id;
			expect(userId).toBeDefined();

			// Clear previous calls
			mockUserRemove.mockClear();

			// Remove the user
			const removeRes = await clientWithMocks.admin.removeUser(
				{ userId: userId || "" },
				{
					headers: adminHead,
				},
			);

			expect(removeRes.data?.success).toBe(true);
			expect(mockUserRemove).toHaveBeenCalled();
			const callArgs = mockUserRemove.mock.calls[0];
			expect(callArgs).toBeDefined();
			expect(callArgs?.[0]).toBeDefined(); // adminSession
			expect(callArgs?.[1]?.email).toBe("toremove@test.com");
		});
	});

	describe("ban event", () => {
		it("should call ban event when admin bans a user", async () => {
			const mockBan = vi.fn();
			const mockEvents = {
				impersonateStart: vi.fn(),
				impersonateEnd: vi.fn(),
				ban: mockBan,
				unban: vi.fn(),
				userCreate: vi.fn(),
				userRemove: vi.fn(),
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			// Create a user first
			const createRes = await clientWithMocks.admin.createUser(
				{
					name: "User to Ban",
					email: "toban@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			const userId = createRes.data?.user.id;
			mockBan.mockClear();

			// Ban the user
			const banRes = await clientWithMocks.admin.banUser(
				{
					userId: userId || "",
					banReason: "Violating terms",
				},
				{
					headers: adminHead,
				},
			);

			expect(banRes.data?.user.banned).toBe(true);
			expect(banRes.data?.user.banReason).toBe("Violating terms");
			expect(mockBan).toHaveBeenCalled();
			const callArgs = mockBan.mock.calls[0];
			expect(callArgs).toBeDefined();
			expect(callArgs?.[0]).toBeDefined(); // adminSession
			expect(callArgs?.[1]?.email).toBe("toban@test.com");
			expect(callArgs?.[1]?.banned).toBe(true);
		});

		it("should receive adminSession in ban event", async () => {
			const mockBan = vi.fn();
			const mockEvents = {
				impersonateStart: vi.fn(),
				impersonateEnd: vi.fn(),
				ban: mockBan,
				unban: vi.fn(),
				userCreate: vi.fn(),
				userRemove: vi.fn(),
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			const createRes = await clientWithMocks.admin.createUser(
				{
					name: "Ban Test User",
					email: "bantest@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			mockBan.mockClear();

			await clientWithMocks.admin.banUser(
				{
					userId: createRes.data?.user.id || "",
					banReason: "Test reason",
				},
				{
					headers: adminHead,
				},
			);

			expect(mockBan).toHaveBeenCalled();
			const callArgs = mockBan.mock.calls[0];
			const [adminSession, bannedUser] = callArgs || [];
			expect(adminSession?.user).toBeDefined();
			expect(adminSession?.user.role).toBe("admin");
			expect(adminSession?.session).toBeDefined();
			expect(bannedUser?.banned).toBe(true);
		});
	});

	describe("unban event", () => {
		it("should call unban event when admin unbans a user", async () => {
			const mockUnban = vi.fn();
			const mockEvents = {
				impersonateStart: vi.fn(),
				impersonateEnd: vi.fn(),
				ban: vi.fn(),
				unban: mockUnban,
				userCreate: vi.fn(),
				userRemove: vi.fn(),
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			// Create and ban a user
			const createRes = await clientWithMocks.admin.createUser(
				{
					name: "User to Unban",
					email: "tounban@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			const userId = createRes.data?.user.id || "";

			await clientWithMocks.admin.banUser(
				{
					userId,
					banReason: "Test ban",
				},
				{
					headers: adminHead,
				},
			);

			mockUnban.mockClear();

			// Unban the user
			const unbanRes = await clientWithMocks.admin.unbanUser(
				{ userId },
				{
					headers: adminHead,
				},
			);

			expect(unbanRes.data?.user.banned).toBe(false);
			expect(mockUnban).toHaveBeenCalled();
			const callArgs = mockUnban.mock.calls[0];
			expect(callArgs).toBeDefined();
			expect(callArgs?.[0]).toBeDefined(); // adminSession
			expect(callArgs?.[1]?.email).toBe("tounban@test.com");
			expect(callArgs?.[1]?.banned).toBe(false);
		});

		it("should receive adminSession in unban event", async () => {
			const mockUnban = vi.fn();
			const mockEvents = {
				impersonateStart: vi.fn(),
				impersonateEnd: vi.fn(),
				ban: vi.fn(),
				unban: mockUnban,
				userCreate: vi.fn(),
				userRemove: vi.fn(),
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			const createRes = await clientWithMocks.admin.createUser(
				{
					name: "Unban Test User",
					email: "unbantest@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			const userId = createRes.data?.user.id || "";

			await clientWithMocks.admin.banUser(
				{ userId, banReason: "Test" },
				{
					headers: adminHead,
				},
			);

			mockUnban.mockClear();

			await clientWithMocks.admin.unbanUser(
				{ userId },
				{
					headers: adminHead,
				},
			);

			expect(mockUnban).toHaveBeenCalled();
			const callArgs = mockUnban.mock.calls[0];
			const [adminSession, unbannedUser] = callArgs || [undefined, undefined];
			expect(adminSession?.user).toBeDefined();
			expect(adminSession?.user.role).toBe("admin");
			expect(adminSession?.session).toBeDefined();
			expect(unbannedUser?.banned).toBe(false);
		});
	});

	describe("impersonateStart event", () => {
		it("should call impersonateStart event when admin impersonates a user", async () => {
			const mockImpersonateStart = vi.fn();
			const mockEvents = {
				impersonateStart: mockImpersonateStart,
				impersonateEnd: vi.fn(),
				ban: vi.fn(),
				unban: vi.fn(),
				userCreate: vi.fn(),
				userRemove: vi.fn(),
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			// Create a user to impersonate
			const createRes = await clientWithMocks.admin.createUser(
				{
					name: "User to Impersonate",
					email: "toimpersonate@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			const userId = createRes.data?.user.id || "";
			mockImpersonateStart.mockClear();

			// Impersonate the user
			const impersonateRes = await clientWithMocks.admin.impersonateUser(
				{ userId },
				{
					headers: adminHead,
				},
			);

			expect(impersonateRes.data?.user).toBeDefined();
			expect(mockImpersonateStart).toHaveBeenCalled();
			const callArgs = mockImpersonateStart.mock.calls[0];
			expect(callArgs).toBeDefined();
			expect(callArgs?.[0]).toBeDefined(); // adminSession
			expect(callArgs?.[1]?.email).toBe("toimpersonate@test.com");
		});

		it("should receive adminSession and impersonated user in impersonateStart", async () => {
			const mockImpersonateStart = vi.fn();
			const mockEvents = {
				impersonateStart: mockImpersonateStart,
				impersonateEnd: vi.fn(),
				ban: vi.fn(),
				unban: vi.fn(),
				userCreate: vi.fn(),
				userRemove: vi.fn(),
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			const createRes = await clientWithMocks.admin.createUser(
				{
					name: "Impersonate Test User",
					email: "impersonatetest@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			mockImpersonateStart.mockClear();

			await clientWithMocks.admin.impersonateUser(
				{ userId: createRes.data?.user.id || "" },
				{
					headers: adminHead,
				},
			);

			expect(mockImpersonateStart).toHaveBeenCalled();
			const callArgs = mockImpersonateStart.mock.calls[0];
			const [adminSession, impersonatedUser] = callArgs || [
				undefined,
				undefined,
			];
			expect(adminSession?.user).toBeDefined();
			expect(adminSession?.user.role).toBe("admin");
			expect(adminSession?.session).toBeDefined();
			expect(impersonatedUser?.email).toBe("impersonatetest@test.com");
		});
	});

	describe("impersonateEnd event", () => {
		it("should call impersonateEnd event when admin stops impersonating", async () => {
			const mockImpersonateEnd = vi.fn();
			const mockEvents = {
				impersonateStart: vi.fn(),
				impersonateEnd: mockImpersonateEnd,
				ban: vi.fn(),
				unban: vi.fn(),
				userCreate: vi.fn(),
				userRemove: vi.fn(),
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
				cookieSetter: testCookieSetter,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			// Create and impersonate a user
			const createRes = await clientWithMocks.admin.createUser(
				{
					name: "User to Stop Impersonating",
					email: "tostopimpersonate@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			const userId = createRes.data?.user.id || "";

			const impersonateHeaders = new Headers();
			await clientWithMocks.admin.impersonateUser(
				{ userId },
				{
					headers: adminHead,
					onSuccess: (ctx) => {
						testCookieSetter(impersonateHeaders)(ctx);
					},
				},
			);

			mockImpersonateEnd.mockClear();

			// Stop impersonating
			const stopRes = await clientWithMocks.admin.stopImpersonating(
				{},
				{
					headers: impersonateHeaders,
					onSuccess: (ctx) => {
						testCookieSetter(impersonateHeaders)(ctx);
					},
				},
			);

			expect(stopRes.data).toBeDefined();
			expect(mockImpersonateEnd).toHaveBeenCalled();
		});

		it("should receive adminSession in impersonateEnd event", async () => {
			const mockImpersonateEnd = vi.fn();
			const mockEvents = {
				impersonateStart: vi.fn(),
				impersonateEnd: mockImpersonateEnd,
				ban: vi.fn(),
				unban: vi.fn(),
				userCreate: vi.fn(),
				userRemove: vi.fn(),
			};

			const {
				auth: authWithMocks,
				customFetchImpl: fetchImpl,
				signInWithTestUser: signInTest,
				cookieSetter: testCookieSetter,
			} = await getTestInstance(
				{
					plugins: [
						admin({
							events: mockEvents,
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

			const clientWithMocks = createAuthClient({
				fetchOptions: {
					customFetchImpl: fetchImpl,
				},
				plugins: [adminClient()],
				baseURL: "http://localhost:3000",
			});

			const { headers: adminHead } = await signInTest();

			const createRes = await clientWithMocks.admin.createUser(
				{
					name: "Impersonate End Test User",
					email: "impersonateendtest@test.com",
					password: "password123",
					role: "user",
				},
				{
					headers: adminHead,
				},
			);

			const impersonateHeaders = new Headers();
			await clientWithMocks.admin.impersonateUser(
				{ userId: createRes.data?.user.id || "" },
				{
					headers: adminHead,
					onSuccess: (ctx) => {
						testCookieSetter(impersonateHeaders)(ctx);
					},
				},
			);

			mockImpersonateEnd.mockClear();

			await clientWithMocks.admin.stopImpersonating(
				{},
				{
					headers: impersonateHeaders,
					onSuccess: (ctx) => {
						testCookieSetter(impersonateHeaders)(ctx);
					},
				},
			);

			expect(mockImpersonateEnd).toHaveBeenCalled();
			const callArgs = mockImpersonateEnd.mock.calls[0];
			const [adminSession] = callArgs || [undefined];
			expect(adminSession?.user).toBeDefined();
			expect(adminSession?.user.role).toBe("admin");
			expect(adminSession?.session).toBeDefined();
		});
	});
});
