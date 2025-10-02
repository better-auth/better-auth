import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite";
import type { BetterAuthPlugin, User } from "../../types";

/**
 * This test suite tests the basic CRUD operations of the adapter.
 */
export const normalTestSuite = createTestSuite("normal", {}, (helpers) => {
	const tests = getNormalTestSuiteTests(helpers);
	return {
		"init - tests": async () => {
			const opts = helpers.getBetterAuthOptions();
			expect(opts.advanced?.database?.useNumberId).toBe(undefined);
		},
		...tests,
	};
});

export const getNormalTestSuiteTests = ({
	adapter,
	generate,
	insertRandom,
	modifyBetterAuthOptions,
	sortModels,
	customIdGenerator,
	getBetterAuthOptions,
}: Parameters<Parameters<typeof createTestSuite>[2]>[0]) => {
	/**
	 * Some databases (such as SQLite) sort rows orders using raw byte values
	 * Meaning that capitalization, numbers and others goes before the rest of the alphabet
	 * Because of the inconsistency, as a bare minimum for testing sorting functionality, we should
	 * remove all capitalizations and numbers from the `name` field
	 */
	const createBinarySortFriendlyUsers = async (count: number) => {
		let users: User[] = [];
		for (let i = 0; i < count; i++) {
			const user = await generate("user");
			const userResult = await adapter.create<User>({
				model: "user",
				data: {
					...user,
					name: user.name.replace(/[0-9]/g, "").toLowerCase(),
				},
				forceAllowId: true,
			});
			users.push(userResult);
		}
		return users;
	};

	return {
		"create - should create a model": async () => {
			const user = await generate("user");
			const result = await adapter.create<User>({
				model: "user",
				data: user,
				forceAllowId: true,
			});
			const options = getBetterAuthOptions();
			if (options.advanced?.database?.useNumberId) {
				expect(typeof result.id).toEqual("string");
				user.id = result.id;
			} else {
				expect(typeof result.id).toEqual("string");
			}
			expect(result).toEqual(user);
		},
		"create - should always return an id": async () => {
			const { id: _, ...user } = await generate("user");
			const res = await adapter.create<User>({
				model: "user",
				data: user,
			});
			expect(res).toHaveProperty("id");
			expect(typeof res.id).toEqual("string");
		},
		"create - should use generateId if provided": async () => {
			const ID = (await customIdGenerator?.()) || "MOCK-ID";
			await modifyBetterAuthOptions(
				{
					advanced: {
						database: {
							generateId: () => ID,
						},
					},
				},
				false,
			);
			const { id: _, ...user } = await generate("user");
			const res = await adapter.create<User>({
				model: "user",
				data: user,
			});
			expect(res.id).toEqual(ID);
			const findResult = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: res.id }],
			});
			expect(findResult).toEqual(res);
		},
		"create - should return null for nullable foreign keys": async () => {
			await modifyBetterAuthOptions(
				{
					plugins: [
						{
							id: "nullable-test",
							schema: {
								testModel: {
									fields: {
										nullableReference: {
											type: "string",
											references: { field: "id", model: "user" },
											required: false,
										},
									},
								},
							},
						} satisfies BetterAuthPlugin,
					],
				},
				true,
			);
			const { nullableReference } = await adapter.create<{
				nullableReference: string | null;
			}>({
				model: "testModel",
				data: { nullableReference: null },
				forceAllowId: true,
			});
			expect(nullableReference).toBeNull();
		},
		"findOne - should find a model": async () => {
			const [user] = await insertRandom("user");
			const result = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: user.id }],
			});
			expect(result).toEqual(user);
		},
		"findOne - should find a model using a reference field": async () => {
			const [user, session] = await insertRandom("session");
			const result = await adapter.findOne<User>({
				model: "session",
				where: [{ field: "userId", value: user.id }],
			});
			expect(result).toEqual(session);
		},
		"findOne - should not throw on record not found": async () => {
			const result = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: "100000" }],
			});
			expect(result).toBeNull();
		},
		"findOne - should find a model without id": async () => {
			const [user] = await insertRandom("user");
			const result = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: user.email }],
			});
			expect(result).toEqual(user);
		},
		"findOne - should find a model with modified field name": async () => {
			await modifyBetterAuthOptions(
				{
					user: {
						fields: {
							email: "email_address",
						},
					},
				},
				true,
			);
			const [user] = await insertRandom("user");
			const result = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: user.email }],
			});
			expect(result).toEqual(user);
			expect(result?.email).toEqual(user.email);
			expect(true).toEqual(true);
		},
		"findOne - should select fields": async () => {
			const [user] = await insertRandom("user");
			const result = await adapter.findOne<Pick<User, "email" | "name">>({
				model: "user",
				where: [{ field: "id", value: user.id }],
				select: ["email", "name"],
			});
			expect(result).toEqual({ email: user.email, name: user.name });
		},
		"findMany - should find many models": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
			});
			expect(sortModels(result)).toEqual(sortModels(users));
		},
		"findMany - should return an empty array when no models are found":
			async () => {
				const result = await adapter.findMany<User>({
					model: "user",
					where: [{ field: "id", value: "100000" }],
				});
				expect(result).toEqual([]);
			},
		"findMany - should find many models with starts_with operator":
			async () => {
				const users = (await insertRandom("user", 3)).map((x) => x[0]);
				const result = await adapter.findMany<User>({
					model: "user",
					where: [{ field: "name", value: "user", operator: "starts_with" }],
				});
				expect(sortModels(result)).toEqual(sortModels(users));
			},
		"findMany - should find many models with ends_with operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "name",
						value: users[0]!.name.slice(-1),
						operator: "ends_with",
					},
				],
			});
			const expectedResult = sortModels(
				users.filter((user) => user.name.endsWith(users[0]!.name.slice(-1))),
			);
			expect(sortModels(result)).toEqual(sortModels(expectedResult));
		},
		"findMany - should find many models with contains operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				where: [{ field: "email", value: "@", operator: "contains" }],
			});
			expect(sortModels(result)).toEqual(sortModels(users));
		},
		"findMany - should find many models with eq operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				where: [{ field: "email", value: users[0]!.email, operator: "eq" }],
			});
			expect(sortModels(result)).toEqual(sortModels([users[0]!]));
		},
		"findMany - should find many models with ne operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				where: [{ field: "email", value: users[0]!.email, operator: "ne" }],
			});
			expect(sortModels(result)).toEqual(sortModels(users.slice(1)));
		},
		"findMany - should find many models with gt operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const oldestUser = users.sort(
				(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
			)[0]!;
			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "createdAt",
						value: oldestUser.createdAt,
						operator: "gt",
					},
				],
			});
			const expectedResult = sortModels(
				users.filter((user) => user.createdAt > oldestUser.createdAt),
			);
			expect(result.length).not.toBe(0);
			expect(sortModels(result)).toEqual(expectedResult);
		},
		"findMany - should find many models with gte operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const oldestUser = users.sort(
				(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
			)[0]!;
			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "createdAt",
						value: oldestUser.createdAt,
						operator: "gte",
					},
				],
			});
			const expectedResult = users.filter(
				(user) => user.createdAt >= oldestUser.createdAt,
			);
			expect(result.length).not.toBe(0);
			expect(sortModels(result)).toEqual(sortModels(expectedResult));
		},
		"findMany - should find many models with lte operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{ field: "createdAt", value: users[0]!.createdAt, operator: "lte" },
				],
			});
			const expectedResult = users.filter(
				(user) => user.createdAt <= users[0]!.createdAt,
			);
			expect(sortModels(result)).toEqual(sortModels(expectedResult));
		},
		"findMany - should find many models with lt operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{ field: "createdAt", value: users[0]!.createdAt, operator: "lt" },
				],
			});
			const expectedResult = users.filter(
				(user) => user.createdAt < users[0]!.createdAt,
			);
			expect(sortModels(result)).toEqual(sortModels(expectedResult));
		},
		"findMany - should find many models with in operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: [users[0]!.id, users[1]!.id],
						operator: "in",
					},
				],
			});
			const expectedResult = users.filter(
				(user) => user.id === users[0]!.id || user.id === users[1]!.id,
			);
			expect(sortModels(result)).toEqual(sortModels(expectedResult));
		},
		"findMany - should find many models with not_in operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: [users[0]!.id, users[1]!.id],
						operator: "not_in",
					},
				],
			});
			expect(sortModels(result)).toEqual([users[2]]);
		},
		"findMany - should find many models with sortBy": async () => {
			const users = await createBinarySortFriendlyUsers(5);
			const result = await adapter.findMany<User>({
				model: "user",
				sortBy: { field: "name", direction: "asc" },
			});
			expect(result.map((x) => x.name)).toEqual(
				users.map((x) => x.name).sort((a, b) => a.localeCompare(b)),
			);
		},
		"findMany - should find many models with limit": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				limit: 1,
			});
			expect(result.length).toEqual(1);
			expect(users.find((x) => x.id === result[0]!.id)).not.toBeNull();
		},
		"findMany - should find many models with offset": async () => {
			// Note: The returned rows are ordered in no particular order
			// This is because databases return rows in whatever order is fastest for the query.
			const count = 10;
			await insertRandom("user", count);
			const result = await adapter.findMany<User>({
				model: "user",
				offset: 2,
			});
			expect(result.length).toEqual(count - 2);
		},
		"findMany - should find many models with limit and offset": async () => {
			// Note: The returned rows are ordered in no particular order
			// This is because databases return rows in whatever order is fastest for the query.
			const count = 5;
			await insertRandom("user", count);
			const result = await adapter.findMany<User>({
				model: "user",
				limit: 2,
				offset: 2,
			});
			expect(result.length).toEqual(2);
			expect(result).toBeInstanceOf(Array);
			result.forEach((user) => {
				expect(user).toHaveProperty("id");
				expect(user).toHaveProperty("name");
				expect(user).toHaveProperty("email");
			});
		},
		"findMany - should find many models with sortBy and offset": async () => {
			const users = await createBinarySortFriendlyUsers(5);
			const result = await adapter.findMany<User>({
				model: "user",
				sortBy: { field: "name", direction: "asc" },
				offset: 2,
			});
			expect(result).toHaveLength(3);
			expect(result).toEqual(
				users.sort((a, b) => a["name"].localeCompare(b["name"])).slice(2),
			);
		},
		"findMany - should find many models with sortBy and limit": async () => {
			const users = await createBinarySortFriendlyUsers(5);
			const result = await adapter.findMany<User>({
				model: "user",
				sortBy: { field: "name", direction: "asc" },
				limit: 2,
			});
			expect(result).toEqual(
				users.sort((a, b) => a["name"].localeCompare(b["name"])).slice(0, 2),
			);
		},
		"findMany - should find many models with sortBy and limit and offset":
			async () => {
				const users = await createBinarySortFriendlyUsers(5);
				const result = await adapter.findMany<User>({
					model: "user",
					sortBy: { field: "name", direction: "asc" },
					limit: 2,
					offset: 2,
				});
				expect(result).toEqual(
					users.sort((a, b) => a["name"].localeCompare(b["name"])).slice(2, 4),
				);
			},
		"findMany - should find many models with sortBy and limit and offset and where":
			async () => {
				const users = await createBinarySortFriendlyUsers(5);
				const result = await adapter.findMany<User>({
					model: "user",
					sortBy: { field: "name", direction: "asc" },
					limit: 2,
					offset: 2,
					where: [{ field: "name", value: "user", operator: "starts_with" }],
				});
				expect(result).toEqual(
					users.sort((a, b) => a["name"].localeCompare(b["name"])).slice(2, 4),
				);
			},
		"update - should update a model": async () => {
			const [user] = await insertRandom("user");
			const result = await adapter.update<User>({
				model: "user",
				where: [{ field: "id", value: user.id }],
				update: { name: "test-name" },
			});
			const expectedResult = {
				...user,
				name: "test-name",
			};
			// because of `onUpdate` hook, the updatedAt field will be different
			result!.updatedAt = user.updatedAt;
			expect(result).toEqual(expectedResult);
			const findResult = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: user.id }],
			});
			// because of `onUpdate` hook, the updatedAt field will be different
			findResult!.updatedAt = user.updatedAt;
			expect(findResult).toEqual(expectedResult);
		},
		"updateMany - should update all models when where is empty": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			await adapter.updateMany({
				model: "user",
				where: [],
				update: { name: "test-name" },
			});
			const result = await adapter.findMany<User>({
				model: "user",
			});
			expect(sortModels(result)).toEqual(
				sortModels(users).map((user, i) => ({
					...user,
					name: "test-name",
					updatedAt: sortModels(result)[i]!.updatedAt,
				})),
			);
		},
		"updateMany - should update many models with a specific where":
			async () => {
				const users = (await insertRandom("user", 3)).map((x) => x[0]);
				await adapter.updateMany({
					model: "user",
					where: [{ field: "id", value: users[0]!.id }],
					update: { name: "test-name" },
				});
				const result = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: users[0]!.id }],
				});
				expect(result).toEqual({
					...users[0],
					name: "test-name",
					updatedAt: result!.updatedAt,
				});
			},
		"updateMany - should update many models with a multiple where":
			async () => {
				const users = (await insertRandom("user", 3)).map((x) => x[0]);
				await adapter.updateMany({
					model: "user",
					where: [
						{ field: "id", value: users[0]!.id, connector: "OR" },
						{ field: "id", value: users[1]!.id, connector: "OR" },
					],
					update: { name: "test-name" },
				});
				const result = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: users[0]!.id }],
				});
				expect(result).toEqual({
					...users[0],
					name: "test-name",
					updatedAt: result!.updatedAt,
				});
			},
		"delete - should delete a model": async () => {
			const [user] = await insertRandom("user");
			await adapter.delete({
				model: "user",
				where: [{ field: "id", value: user.id }],
			});
			const result = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: user.id }],
			});
			expect(result).toBeNull();
		},
		"delete - should not throw on record not found": async () => {
			await expect(
				adapter.delete({
					model: "user",
					where: [{ field: "id", value: "100000" }],
				}),
			).resolves.not.toThrow();
		},
		"deleteMany - should delete many models": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			await adapter.deleteMany({
				model: "user",
				where: [
					{ field: "id", value: users[0]!.id, connector: "OR" },
					{ field: "id", value: users[1]!.id, connector: "OR" },
				],
			});
			const result = await adapter.findMany<User>({
				model: "user",
			});
			expect(sortModels(result)).toEqual(sortModels(users.slice(2)));
		},
		"count - should count many models": async () => {
			const users = await insertRandom("user", 15);
			const result = await adapter.count({
				model: "user",
			});
			expect(result).toEqual(users.length);
		},
		"count - should return 0 with no rows to count": async () => {
			const result = await adapter.count({
				model: "user",
			});
			expect(result).toEqual(0);
		},
		"count - should count with where clause": async () => {
			const users = (await insertRandom("user", 15)).map((x) => x[0]);
			const result = await adapter.count({
				model: "user",
				where: [
					{ field: "id", value: users[2]!.id, connector: "OR" },
					{ field: "id", value: users[3]!.id, connector: "OR" },
				],
			});
			expect(result).toEqual(2);
		},
		"update - should correctly return record when updating a field used in where clause":
			async () => {
				// This tests the fix for MySQL where updating a field that's in the where clause
				// would previously fail to find the record using the old value
				const [user] = await insertRandom("user");
				const originalEmail = user.email;

				// Update the email, using the old email in the where clause
				const result = await adapter.update<User>({
					model: "user",
					where: [{ field: "email", value: originalEmail }],
					update: { email: "newemail@example.com" },
				});

				// Should return the updated record with the new email
				expect(result).toBeDefined();
				expect(result!.email).toBe("newemail@example.com");
				expect(result!.id).toBe(user.id);

				// Verify the update persisted by finding with new email
				const foundUser = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "email", value: "newemail@example.com" }],
				});
				expect(foundUser).toBeDefined();
				expect(foundUser!.id).toBe(user.id);

				// Old email should not exist
				const oldUser = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "email", value: originalEmail }],
				});
				expect(oldUser).toBeNull();
			},

		"update - should handle updating multiple fields including where clause field":
			async () => {
				const [user] = await insertRandom("user");
				const originalEmail = user.email;

				const result = await adapter.update<User>({
					model: "user",
					where: [{ field: "email", value: originalEmail }],
					update: {
						email: "updated@example.com",
						name: "Updated Name",
						emailVerified: true,
					},
				});

				expect(result!.email).toBe("updated@example.com");
				expect(result!.name).toBe("Updated Name");
				expect(result!.emailVerified).toBe(true);
				expect(result!.id).toBe(user.id);
			},

		"update - should work when updated field is not in where clause":
			async () => {
				// Regression test: ensure normal updates still work
				const [user] = await insertRandom("user");

				const result = await adapter.update<User>({
					model: "user",
					where: [{ field: "email", value: user.email }],
					update: { name: "Updated Name Only" },
				});

				expect(result!.name).toBe("Updated Name Only");
				expect(result!.email).toBe(user.email); // Should remain unchanged
				expect(result!.id).toBe(user.id);
			},
	};
};
