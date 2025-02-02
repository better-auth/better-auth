import { expect, test } from "vitest";
import type { Adapter, BetterAuthOptions, User } from "../types";
import { generateId } from "../utils";

interface AdapterTestOptions {
	/**
	 * Get the adapter to test
	 */
	getAdapter: (
		customOptions?: Omit<BetterAuthOptions, "database">,
	) => Promise<Adapter>;
	/**
	 * Skip tests as needed
	 */
	testSkips?: {
		createModel?: boolean;
		createModelWithSelect?: boolean;
		findModel?: boolean;
		findModelWithoutId?: boolean;
		findModelWithSelect?: boolean;
		updateModel?: boolean;
		findMany?: boolean;
		shouldFindManyWithWhere?: boolean;
		shouldFindManyWithOperators?: boolean;
		shouldFindManyWithSortBy?: boolean;
		shouldFindManyWithLimit?: boolean;
		shouldFindManyWithOffsetAndLimit?: boolean;
		shouldFindManyWithOffset?: boolean;
		shouldUpdateWithMultipleWhere?: boolean;
		deleteModel?: boolean;
		shouldWorkWithReferenceFields?: boolean;
		shouldDeleteMany?: boolean;
		shouldNotThrowOnDeleteRecordNotFound?: boolean;
		shouldFindManyWithContainsOperator?: boolean;
		shouldSearchUsersWithStartsWith?: boolean;
		shouldSearchUsersWithEndsWith?: boolean;
		generateId?: boolean;
	};
}

export async function runAdapterTest(opts: AdapterTestOptions) {
	const adapter = await opts.getAdapter();
	const testSkips = opts.testSkips || {};
	const user = {
		id: "1",
		name: "user",
		email: "user@email.com",
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	test.skipIf(testSkips.createModel)("create model", async () => {
		const res = await adapter.create({
			model: "user",
			data: user,
		});
		expect({
			name: res.name,
			email: res.email,
		}).toEqual({
			name: user.name,
			email: user.email,
		});
		user.id = res.id;
	});

	test.skipIf(testSkips.createModelWithSelect)(
		"create model with select",
		async () => {
			const id = generateId();
			const res = await adapter.create<User>({
				model: "user",
				select: ["id"],
				data: {
					...user,
					id,
				},
			});

			expect(res).toEqual({
				id: id,
			});
		},
	);

	test.skipIf(testSkips.findModel)("find model", async () => {
		const res = await adapter.findOne<User>({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
		});
		expect({
			name: res?.name,
			email: res?.email,
		}).toEqual({
			name: user.name,
			email: user.email,
		});
	});

	test.skipIf(testSkips.findModelWithoutId)(
		"find model without id",
		async () => {
			const res = await adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "email",
						value: user.email,
					},
				],
			});
			expect({
				name: res?.name,
				email: res?.email,
			}).toEqual({
				name: user.name,
				email: user.email,
			});
		},
	);

	test.skipIf(testSkips.findModelWithSelect)(
		"find model with select",
		async () => {
			const res = await adapter.findOne({
				model: "user",
				where: [
					{
						field: "id",
						value: user.id,
					},
				],
				select: ["email"],
			});
			expect(res).toEqual({ email: user.email });
		},
	);

	test.skipIf(testSkips.updateModel)("update model", async () => {
		const newEmail = "updated@email.com";

		const res = await adapter.update<User>({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
			update: {
				email: newEmail,
			},
		});
		expect(res).toMatchObject({
			email: newEmail,
			name: user.name,
		});
	});

	test.skipIf(testSkips.findMany)("should find many", async () => {
		const res = await adapter.findMany({
			model: "user",
		});
		expect(res.length).toBe(1);
	});

	test.skipIf(testSkips.shouldFindManyWithWhere)(
		"should find many with where",
		async () => {
			const user = await adapter.create<User>({
				model: "user",
				data: {
					id: "2",
					name: "user2",
					email: "test@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const res = await adapter.findMany({
				model: "user",
				where: [
					{
						field: "id",
						value: user.id,
					},
				],
			});
			expect(res.length).toBe(1);
		},
	);

	test.skipIf(testSkips.shouldFindManyWithOperators)(
		"should find many with operators",
		async () => {
			const newUser = await adapter.create<User>({
				model: "user",
				data: {
					id: "3",
					name: "user",
					email: "test-email2@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const res = await adapter.findMany({
				model: "user",
				where: [
					{
						field: "id",
						operator: "in",
						value: [user.id, newUser.id],
					},
				],
			});
			expect(res.length).toBe(2);
		},
	);

	test.skipIf(testSkips.shouldWorkWithReferenceFields)(
		"should work with reference fields",
		async () => {
			const user = await adapter.create<{ id: string } & Record<string, any>>({
				model: "user",
				data: {
					id: "4",
					name: "user",
					email: "my-email@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "session",
				data: {
					id: "1",
					token: generateId(),
					createdAt: new Date(),
					updatedAt: new Date(),
					userId: user.id,
					expiresAt: new Date(),
				},
			});
			const res = await adapter.findOne({
				model: "session",
				where: [
					{
						field: "userId",
						value: user.id,
					},
				],
			});
			expect(res).toMatchObject({
				userId: user.id,
			});
		},
	);

	test.skipIf(testSkips.shouldFindManyWithSortBy)(
		"should find many with sortBy",
		async () => {
			await adapter.create({
				model: "user",
				data: {
					id: "5",
					name: "a",
					email: "a@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const res = await adapter.findMany<User>({
				model: "user",
				sortBy: {
					field: "name",
					direction: "asc",
				},
			});
			expect(res[0].name).toBe("a");

			const res2 = await adapter.findMany<User>({
				model: "user",
				sortBy: {
					field: "name",
					direction: "desc",
				},
			});

			expect(res2[res2.length - 1].name).toBe("a");
		},
	);

	test.skipIf(testSkips.shouldFindManyWithLimit)(
		"should find many with limit",
		async () => {
			const res = await adapter.findMany({
				model: "user",
				limit: 1,
			});
			expect(res.length).toBe(1);
		},
	);

	test.skipIf(testSkips.shouldFindManyWithOffset)(
		"should find many with offset",
		async () => {
			const res = await adapter.findMany({
				model: "user",
				offset: 2,
			});
			expect(res.length).toBe(4);
		},
	);
	test.skipIf(testSkips.shouldFindManyWithOffsetAndLimit)(
		"should find many with offset and limit",
		async () => {
			// At this point, `user` contains 5 rows.
			// offset of 2 returns 3 rows
			// limit of 2 returns 2 rows
			const res = await adapter.findMany({
				model: "user",
				offset: 2,
				limit: 2,
			});
			expect(res.length).toBe(2);
		},
	);

	test.skipIf(testSkips.shouldUpdateWithMultipleWhere)(
		"should update with multiple where",
		async () => {
			await adapter.updateMany({
				model: "user",
				where: [
					{
						field: "name",
						value: user.name,
					},
					{
						field: "email",
						value: user.email,
					},
				],
				update: {
					email: "updated@email.com",
				},
			});
			const updatedUser = await adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "email",
						value: "updated@email.com",
					},
				],
			});
			expect(updatedUser).toMatchObject({
				name: user.name,
				email: "updated@email.com",
			});
		},
	);

	test.skipIf(testSkips.deleteModel)("delete model", async () => {
		await adapter.delete({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
		});
		const findRes = await adapter.findOne({
			model: "user",
			where: [
				{
					field: "id",
					value: user.id,
				},
			],
		});
		expect(findRes).toBeNull();
	});

	test.skipIf(testSkips.shouldDeleteMany)("should delete many", async () => {
		for (const id of ["to-be-delete1", "to-be-delete2", "to-be-delete3"]) {
			await adapter.create({
				model: "user",
				data: {
					id,
					name: "to-be-deleted",
					email: `email@test-${id}.com`,
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		}
		const findResFirst = await adapter.findMany({
			model: "user",
			where: [
				{
					field: "name",
					value: "to-be-deleted",
				},
			],
		});
		expect(findResFirst.length).toBe(3);
		await adapter.deleteMany({
			model: "user",
			where: [
				{
					field: "name",
					value: "to-be-deleted",
				},
			],
		});
		const findRes = await adapter.findMany({
			model: "user",
			where: [
				{
					field: "name",
					value: "to-be-deleted",
				},
			],
		});
		expect(findRes.length).toBe(0);
	});

	test.skipIf(testSkips.shouldNotThrowOnDeleteRecordNotFound)(
		"shouldn't throw on delete record not found",
		async () => {
			await adapter.delete({
				model: "user",
				where: [
					{
						field: "id",
						value: "5",
					},
				],
			});
		},
	);

	test.skipIf(testSkips.shouldFindManyWithContainsOperator)(
		"should find many with contains operator",
		async () => {
			const res = await adapter.findMany({
				model: "user",
				where: [
					{
						field: "name",
						operator: "contains",
						value: "user2",
					},
				],
			});
			expect(res.length).toBe(1);
		},
	);

	test.skipIf(testSkips.shouldSearchUsersWithStartsWith)(
		"should search users with startsWith",
		async () => {
			const res = await adapter.findMany({
				model: "user",
				where: [
					{
						field: "name",
						operator: "starts_with",
						value: "us",
					},
				],
			});
			expect(res.length).toBe(3);
		},
	);

	test.skipIf(testSkips.shouldSearchUsersWithEndsWith)(
		"should search users with endsWith",
		async () => {
			const res = await adapter.findMany({
				model: "user",
				where: [
					{
						field: "name",
						operator: "ends_with",
						value: "er2",
					},
				],
			});
			expect(res.length).toBe(1);
		},
	);

	test.skipIf(testSkips.generateId)(
		"should prefer generateId if provided",
		async () => {
			const customAdapter = await opts.getAdapter({
				advanced: {
					generateId: () => "mocked-id",
				},
			});

			const res = await customAdapter.create({
				model: "user",
				data: {
					id: "1",
					name: "user4",
					email: "user4@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			expect(res.id).toBe("mocked-id");
		},
	);
}
