import { describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

describe("lastLoginAt feature", () => {
	describe("initial state", () => {
		it("should have lastLoginAt as null for new users", async () => {
			const { client } = await getTestInstance();

			const signUpResponse = await client.signUp.email({
				email: "newuser@test.com",
				password: "password123",
				name: "New User",
			});

			expect(signUpResponse.data).toBeDefined();
			expect(signUpResponse.data?.user.lastLoginAt).toBeNull();
		});
	});

	describe("session creation updates lastLoginAt", () => {
		it("should update lastLoginAt when user signs in with email", async () => {
			const { client } = await getTestInstance();

			await client.signUp.email({
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			});

			const signInResponse = await client.signIn.email({
				email: "test@example.com",
				password: "password123",
			});

			expect(signInResponse.data).toBeDefined();
			expect(signInResponse.data?.user.lastLoginAt).toBeInstanceOf(
				Date,
			);
			expect(signInResponse.data?.user.lastLoginAt).not.toBeNull();
		});

		it("should update lastLoginAt on subsequent logins", async () => {
			const { client } = await getTestInstance();

			await client.signUp.email({
				email: "multi@example.com",
				password: "password123",
				name: "Multi Login User",
			});

			const firstSignIn = await client.signIn.email({
				email: "multi@example.com",
				password: "password123",
			});

			const firstLoginTime = firstSignIn.data?.user.lastLoginAt;
			expect(firstLoginTime).toBeInstanceOf(Date);

			await new Promise((resolve) => setTimeout(resolve, 10));

			const secondSignIn = await client.signIn.email({
				email: "multi@example.com",
				password: "password123",
			});

			const secondLoginTime = secondSignIn.data?.user.lastLoginAt;
			expect(secondLoginTime).toBeInstanceOf(Date);
			expect(secondLoginTime).not.toEqual(firstLoginTime);
			expect(secondLoginTime!.getTime()).toBeGreaterThan(
				firstLoginTime!.getTime(),
			);
		});
	});

	describe("database persistence", () => {
		it("should persist lastLoginAt in database", async () => {
			const { client, db } = await getTestInstance();

			await client.signUp.email({
				email: "persist@example.com",
				password: "password123",
				name: "Persist User",
			});

			const signInResponse = await client.signIn.email({
				email: "persist@example.com",
				password: "password123",
			});

			const userId = signInResponse.data?.user.id;
			expect(userId).toBeDefined();

			const users = await db.findMany({
				model: "user",
				where: [{ field: "id", value: userId! }],
			});

			expect(users).toHaveLength(1);
			expect((users[0] as any).lastLoginAt).toBeInstanceOf(Date);
			expect((users[0] as any).lastLoginAt).not.toBeNull();
		});
	});
});
