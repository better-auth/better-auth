import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { USERNAME_ERROR_CODES, username } from "../username";
import { usernameClient } from "../username/client";
import { admin } from "./admin";
import { adminClient } from "./client";

/**
 * Tests for admin + username plugin interaction
 * @see https://github.com/better-auth/better-auth/issues/9446
 *
 * When using the username plugin together with the admin plugin,
 * the admin createUser endpoint should:
 * 1. Validate duplicate usernames
 * 2. Auto-populate displayUsername when only username is provided
 * 3. Normalize usernames (this already works via databaseHooks)
 */
describe("admin + username plugin interaction", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
		{
			plugins: [
				username(),
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
		plugins: [adminClient(), usernameClient()],
		baseURL: "http://localhost:3000",
	});

	const { headers: adminHeaders } = await signInWithTestUser();

	it("should normalize username when creating user via admin endpoint", async () => {
		const res = await auth.api.createUser({
			body: {
				email: "testuser1@example.com",
				password: "some-secure-password",
				name: "James Smith",
				role: "user",
				data: { username: "JamesSmith" },
			},
		});

		const user = res.user as typeof res.user & {
			username: string;
			displayUsername: string;
		};
		expect(user.username).toBe("jamessmith");
	});

	/**
	 * This test validates the bug reported in issue #9446
	 * Currently FAILS because duplicate username validation is not performed
	 * when creating users via admin endpoint - instead of a proper error,
	 * it throws a database constraint error.
	 */
	it("should reject duplicate username when creating user via admin endpoint", async () => {
		const res = await client.admin.createUser(
			{
				email: "testuser2@example.com",
				password: "some-secure-password",
				name: "James Smith 2",
				role: "user",
				data: { username: "JamesSmith" },
			},
			{
				headers: adminHeaders,
			},
		);

		expect(res.error?.code).toBe(
			USERNAME_ERROR_CODES.USERNAME_IS_ALREADY_TAKEN.code,
		);
	});

	/**
	 * This test validates the bug reported in issue #9446
	 * Currently FAILS because displayUsername is not auto-populated
	 * when creating users via admin endpoint
	 */
	it("should auto-populate displayUsername when creating user via admin endpoint", async () => {
		const res = await auth.api.createUser({
			body: {
				email: "testuser3@example.com",
				password: "some-secure-password",
				name: "Test User 3",
				role: "user",
				data: { username: "TestUser3" },
			},
		});

		const user = res.user as typeof res.user & {
			username: string;
			displayUsername: string;
		};
		expect(user.username).toBe("testuser3");
		expect(user.displayUsername).toBe("TestUser3");
	});

	it("should validate username format when creating user via admin endpoint", async () => {
		const res = await client.admin.createUser(
			{
				email: "testuser4@example.com",
				password: "some-secure-password",
				name: "Test User 4",
				role: "user",
				data: { username: "Invalid Username!" },
			},
			{
				headers: adminHeaders,
			},
		);

		expect(res.error?.code).toBe(USERNAME_ERROR_CODES.INVALID_USERNAME.code);
	});

	it("should validate username length when creating user via admin endpoint", async () => {
		const res = await client.admin.createUser(
			{
				email: "testuser5@example.com",
				password: "some-secure-password",
				name: "Test User 5",
				role: "user",
				data: { username: "ab" },
			},
			{
				headers: adminHeaders,
			},
		);

		expect(res.error?.code).toBe(USERNAME_ERROR_CODES.USERNAME_TOO_SHORT.code);
	});
});
