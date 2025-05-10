import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin, type UserWithRole } from "./admin";
import { adminClient } from "./client";
import { createAccessControl } from "../access";
import { createAuthClient } from "../../client";
import type { GoogleProfile } from "../../social-providers";
import { signJWT } from "../../crypto";
import { DEFAULT_SECRET } from "../../utils/constants";
import { getOAuth2Tokens } from "../../oauth2";

vi.mock("../../oauth2", async (importOriginal) => {
	const original = (await importOriginal()) as any;
	return {
		...original,
		validateAuthorizationCode: vi
			.fn()
			.mockImplementation(async (...args: any) => {
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
				const testIdToken = await signJWT(data, DEFAULT_SECRET);
				const tokens = getOAuth2Tokens({
					access_token: "test",
					refresh_token: "test",
					id_token: testIdToken,
				});
				return tokens;
			}),
		refreshAccessToken: vi.fn().mockImplementation(async (args) => {
			const { refreshToken, options, tokenEndpoint } = args;
			expect(refreshToken).toBeDefined();
			expect(options.clientId).toBe("test-client-id");
			expect(options.clientSecret).toBe("test-client-secret");
			expect(tokenEndpoint).toBe("http://localhost:8080/token");

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
			const testIdToken = await signJWT(data, DEFAULT_SECRET);
			const tokens = getOAuth2Tokens({
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				id_token: testIdToken,
				token_type: "Bearer",
				expires_in: 3600, // Token expires in 1 hour
			});
			return tokens;
		}),
	};
});

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
		email: "user@test.com",
		password: "password",
		name: "Test User",
	};
	await client.signUp.email(testNonAdminUser);
	const { headers: userHeaders } = await signInWithUser(
		testNonAdminUser.email,
		testNonAdminUser.password,
	);

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
		const res = await client.signIn.social(
			{
				provider: "google",
			},
			{
				throw: true,
			},
		);
		const state = new URL(res.url!).searchParams.get("state");
		let errorLocation: string | null = null;
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
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
			{ sessionToken: sessions.data?.sessions[0].token || "" },
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
		expect(response.data?.users.length).toBe(2);
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
});

describe("access control", async (it) => {
	const ac = createAccessControl({
		user: ["create", "read", "update", "delete", "list", "bulk-delete"],
		order: ["create", "read", "update", "delete", "update-many"],
	});

	const adminAc = ac.newRole({
		user: ["create", "read", "update", "delete", "list"],
		order: ["create", "read", "update", "delete"],
	});
	const userAc = ac.newRole({
		user: ["read"],
		order: ["read"],
	});

	const {
		signInWithTestUser,
		signInWithUser,
		cookieSetter,
		auth,
		customFetchImpl,
	} = await getTestInstance(
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
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	const { headers, user } = await signInWithTestUser();

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

	it("shouldn't allow to list users", async () => {
		const { headers } = await signInWithTestUser();
		const adminRes = await client.admin.listUsers({
			query: {
				limit: 2,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(adminRes.data?.users.length).toBe(1);
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
});
