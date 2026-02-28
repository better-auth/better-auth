import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

describe("db", async () => {
	it("should work with custom model names", async () => {
		const { client, db } = await getTestInstance({
			user: {
				modelName: "users",
			},
			session: {
				modelName: "sessions",
			},
			account: {
				modelName: "accounts",
			},
		});
		const res = await client.signUp.email({
			email: "test@email2.com",
			password: "password",
			name: "Test User",
		});
		const users = await db.findMany({
			model: "user",
		});
		const session = await db.findMany({
			model: "session",
		});
		const accounts = await db.findMany({
			model: "account",
		});
		expect(res.data).toBeDefined();
		//including the user that was created in the test instance
		expect(users).toHaveLength(2);
		expect(session).toHaveLength(2);
		expect(accounts).toHaveLength(2);
	});

	it("db hooks", async () => {
		let callback = false;
		const { client } = await getTestInstance({
			databaseHooks: {
				user: {
					create: {
						async before(user) {
							return {
								data: {
									...user,
									image: "test-image",
								},
							};
						},
						async after(user) {
							callback = true;
						},
					},
				},
			},
		});
		const res = await client.signUp.email({
			email: "test@email.com",
			name: "test",
			password: "password",
		});
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${res.data?.token}`,
				},
				throw: true,
			},
		});
		expect(session?.user?.image).toBe("test-image");
		expect(callback).toBe(true);
	});

	it("should work with custom field names", async () => {
		const { client } = await getTestInstance({
			user: {
				fields: {
					email: "email_address",
				},
			},
		});
		const res = await client.signUp.email({
			email: "test@email.com",
			password: "password",
			name: "Test User",
		});
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${res.data?.token}`,
				},
				throw: true,
			},
		});
		expect(session?.user.email).toBe("test@email.com");
	});

	it("should coerce string where values to match field types", async () => {
		// HTTP query params arrive as strings.
		// The adapter should coerce values to match the field's schema type.
		const { auth, db } = await getTestInstance(
			{
				user: {
					additionalFields: {
						age: { type: "number", required: false },
					},
				},
			},
			{
				// Uses MongoDB because SQLite/MySQL/PostgreSQL silently cast types,
				// which would make this test pass even without the coercion code.
				testWith: "mongodb",
			},
		);

		// boolean: "false" → false, "true" → true
		const users = await db.findMany<{ emailVerified: boolean }>({
			model: "user",
			where: [{ field: "emailVerified", operator: "eq", value: "false" }],
		});
		expect(users.length).toBeGreaterThanOrEqual(1);
		expect(users.every((u) => u.emailVerified === false)).toBe(true);

		// number: "25" → 25
		await db.update({
			model: "user",
			where: [{ field: "emailVerified", operator: "eq", value: false }],
			update: { age: 25 },
		});
		const byAge = await db.findMany<{ age: number | null }>({
			model: "user",
			where: [{ field: "age", operator: "eq", value: "25" }],
		});
		expect(byAge.length).toBeGreaterThanOrEqual(1);
		expect(byAge.every((u) => u.age === 25)).toBe(true);

		// number array: ["25", "30"] → [25, 30]
		await auth.api.signUpEmail({
			body: {
				email: "age30@test.com",
				password: "password",
				name: "user-30",
				age: 30,
			},
		});
		await auth.api.signUpEmail({
			body: {
				email: "age40@test.com",
				password: "password",
				name: "user-40",
				age: 40,
			},
		});
		const byAgeIn = await db.findMany<{ age: number | null }>({
			model: "user",
			where: [{ field: "age", operator: "in", value: ["25", "30"] }],
		});
		expect(byAgeIn).toHaveLength(2);
		expect(byAgeIn.map((u) => u.age).sort()).toEqual([25, 30]);
	});

	it("delete hooks", async () => {
		const hookUserDeleteBefore = vi.fn();
		const hookUserDeleteAfter = vi.fn();
		const hookSessionDeleteBefore = vi.fn();
		const hookSessionDeleteAfter = vi.fn();

		const { client } = await getTestInstance({
			session: {
				storeSessionInDatabase: true,
			},
			user: {
				deleteUser: {
					enabled: true,
				},
			},
			databaseHooks: {
				user: {
					delete: {
						async before(user, context) {
							hookUserDeleteBefore(user, context);
							return true;
						},
						async after(user, context) {
							hookUserDeleteAfter(user, context);
						},
					},
				},
				session: {
					delete: {
						async before(session, context) {
							hookSessionDeleteBefore(session, context);
							return true;
						},
						async after(session, context) {
							hookSessionDeleteAfter(session, context);
						},
					},
				},
			},
		});

		const res = await client.signUp.email({
			email: "delete-test@email.com",
			password: "password",
			name: "Delete Test User",
		});

		expect(res.data).toBeDefined();
		const userId = res.data?.user.id;

		await client.deleteUser({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${res.data?.token}`,
				},
				throw: true,
			},
		});

		expect(hookUserDeleteBefore).toHaveBeenCalledOnce();
		expect(hookUserDeleteAfter).toHaveBeenCalledOnce();
		expect(hookSessionDeleteBefore).toHaveBeenCalledOnce();
		expect(hookSessionDeleteAfter).toHaveBeenCalledOnce();

		expect(hookUserDeleteBefore).toHaveBeenCalledWith(
			expect.objectContaining({
				id: userId,
				email: "delete-test@email.com",
				name: "Delete Test User",
			}),
			expect.any(Object),
		);

		expect(hookUserDeleteAfter).toHaveBeenCalledWith(
			expect.objectContaining({
				id: userId,
				email: "delete-test@email.com",
				name: "Delete Test User",
			}),
			expect.any(Object),
		);
	});

	it("delete hooks abort", async () => {
		const hookUserDeleteBefore = vi.fn();
		const hookUserDeleteAfter = vi.fn();

		const { client } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
			databaseHooks: {
				user: {
					delete: {
						async before(user, context) {
							hookUserDeleteBefore(user, context);
							return false;
						},
						async after(user, context) {
							hookUserDeleteAfter(user, context);
						},
					},
				},
			},
		});

		const res = await client.signUp.email({
			email: "abort-delete-test@email.com",
			password: "password",
			name: "Abort Delete Test User",
		});

		expect(res.data).toBeDefined();
		const userId = res.data?.user.id;

		try {
			await client.deleteUser({
				fetchOptions: {
					headers: {
						Authorization: `Bearer ${res.data?.token}`,
					},
					throw: true,
				},
			});
		} catch {
			// Expected to fail due to hook returning false
		}

		expect(hookUserDeleteBefore).toHaveBeenCalledOnce();
		expect(hookUserDeleteAfter).not.toHaveBeenCalled();

		expect(hookUserDeleteBefore).toHaveBeenCalledWith(
			expect.objectContaining({
				id: userId,
				email: "abort-delete-test@email.com",
				name: "Abort Delete Test User",
			}),
			expect.any(Object),
		);
	});
});
