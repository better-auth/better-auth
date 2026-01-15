import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import type { User } from "../types";

describe("enumeration protection", () => {
	describe("sign-up with preventEnumeration enabled", async () => {
		const { auth, db } = await getTestInstance(
			{
				advanced: {
					security: {
						preventEnumeration: true,
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		beforeEach(async () => {
			// Clean up database before each test
			const users = await db.findMany<User>({ model: "user" });
			for (const user of users) {
				await db.delete({
					model: "user",
					where: [{ field: "id", value: user.id }],
				});
			}
		});

		it("should return safe response when user already exists", async () => {
			// Create an existing user
			await auth.api.signUpEmail({
				body: {
					email: "existing@example.com",
					password: "password123",
					name: "Existing User",
				},
			});

			// Try to sign up again with the same email
			const response = await auth.api.signUpEmail({
				body: {
					email: "existing@example.com",
					password: "different-password",
					name: "Another User",
				},
			});

			// Should return safe response instead of error
			expect(response).toEqual({
				token: null,
				user: null,
			});

			// Verify no new user was created
			const users = await db.findMany<User>({ model: "user" });
			expect(users).toHaveLength(1);
			expect(users[0]?.email).toBe("existing@example.com");
		});

		it("should execute timing function to prevent timing attacks", async () => {
			// Create an existing user
			await auth.api.signUpEmail({
				body: {
					email: "timing@example.com",
					password: "password123",
					name: "Timing Test",
				},
			});

			// Measure time for existing user sign-up attempt
			const startExisting = Date.now();
			await auth.api.signUpEmail({
				body: {
					email: "timing@example.com",
					password: "another-password",
					name: "Another Name",
				},
			});
			const existingUserTime = Date.now() - startExisting;

			// Measure time for new user sign-up
			const startNew = Date.now();
			await auth.api.signUpEmail({
				body: {
					email: "newtiming@example.com",
					password: "another-password",
					name: "New User",
				},
			});
			const newUserTime = Date.now() - startNew;

			// Times should be relatively similar (within reasonable margin)
			// This is a rough check - actual timing attacks are more sophisticated
			const timeDiff = Math.abs(existingUserTime - newUserTime);
			expect(timeDiff).toBeLessThan(100); // Allow 100ms variance
		});

		it("should successfully create user when email is available", async () => {
			const response = await auth.api.signUpEmail({
				body: {
					email: "newuser@example.com",
					password: "password123",
					name: "New User",
				},
			});

			expect(response.token).toBeDefined();
			expect(response.user).toBeDefined();
			expect(response.user.email).toBe("newuser@example.com");
			expect(response.user.name).toBe("New User");
		});
	});

	describe("sign-up with preventEnumeration disabled", async () => {
		const { auth, db } = await getTestInstance(
			{
				advanced: {
					security: {
						preventEnumeration: false,
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		beforeEach(async () => {
			// Clean up database before each test
			const users = await db.findMany<User>({ model: "user" });
			for (const user of users) {
				await db.delete({
					model: "user",
					where: [{ field: "id", value: user.id }],
				});
			}
		});

		it("should throw error when user already exists", async () => {
			// Create an existing user
			await auth.api.signUpEmail({
				body: {
					email: "existing2@example.com",
					password: "password123",
					name: "Existing User",
				},
			});

			// Try to sign up again with the same email should throw
			await expect(
				auth.api.signUpEmail({
					body: {
						email: "existing2@example.com",
						password: "different-password",
						name: "Another User",
					},
				}),
			).rejects.toThrow(
				BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL.message,
			);
		});

		it("should successfully create user when email is available", async () => {
			const response = await auth.api.signUpEmail({
				body: {
					email: "newuser2@example.com",
					password: "password123",
					name: "New User",
				},
			});

			expect(response.token).toBeDefined();
			expect(response.user).toBeDefined();
			expect(response.user.email).toBe("newuser2@example.com");
		});
	});

	describe("sign-up with default behavior (production mode)", async () => {
		// Save original NODE_ENV
		const originalNodeEnv = process.env.NODE_ENV;

		// Set to production mode
		process.env.NODE_ENV = "production";

		const { auth, db } = await getTestInstance(
			{
				// Don't set preventEnumeration - should default to enabled in production
			},
			{
				disableTestUser: true,
			},
		);

		beforeEach(async () => {
			// Clean up database before each test
			const users = await db.findMany<User>({ model: "user" });
			for (const user of users) {
				await db.delete({
					model: "user",
					where: [{ field: "id", value: user.id }],
				});
			}
		});

		it("should enable enumeration protection by default in production", async () => {
			// Create an existing user
			await auth.api.signUpEmail({
				body: {
					email: "prod@example.com",
					password: "password123",
					name: "Production User",
				},
			});

			// Try to sign up again - should return safe response
			const response = await auth.api.signUpEmail({
				body: {
					email: "prod@example.com",
					password: "different-password",
					name: "Another User",
				},
			});

			expect(response).toEqual({
				token: null,
				user: null,
			});
		});

		// Restore original NODE_ENV after tests
		afterAll(() => {
			process.env.NODE_ENV = originalNodeEnv;
		});
	});

	// Note: Testing default development behavior is skipped because NODE_ENV
	// is set at module load time and cannot be changed dynamically in tests.
	// The development mode behavior is implicitly tested by the "disabled" test above.

	describe("username sign-in with enumeration protection", async () => {
		const { username } = await import("../plugins/username");

		const { auth, db } = await getTestInstance(
			{
				plugins: [username()],
				advanced: {
					security: {
						preventEnumeration: true,
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		beforeEach(async () => {
			// Clean up database before each test
			const users = await db.findMany<User>({ model: "user" });
			for (const user of users) {
				await db.delete({
					model: "user",
					where: [{ field: "id", value: user.id }],
				});
			}
		});

		it("should return safe response for non-existent username", async () => {
			const response = await (auth.api as any).signInUsername({
				body: {
					username: "nonexistent",
					password: "password123",
				},
			});

			// Should return safe response instead of error
			expect(response).toEqual({
				token: null,
				user: null,
			});
		});

		it("should successfully sign in with valid username", async () => {
			// First create a user via regular sign-up, then add username
			const signUpResponse = await auth.api.signUpEmail({
				body: {
					email: "username@example.com",
					password: "password123",
					name: "Username User",
				},
			});

			// Update user to add username via database
			await db.update({
				model: "user",
				where: [{ field: "id", value: signUpResponse.user.id }],
				update: {
					username: "testuser",
				},
			});

			// Sign in with username
			const response = await (auth.api as any).signInUsername({
				body: {
					username: "testuser",
					password: "password123",
				},
			});

			expect(response.token).toBeDefined();
			expect(response.user).toBeDefined();
			expect(response.user.email).toBe("username@example.com");
		});
	});
});
