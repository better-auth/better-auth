import { expect, test, describe, beforeAll } from "vitest";
import type { Adapter, BetterAuthOptions, User } from "../types";
import { generateId } from "../utils";

interface AdapterTestOptions {
	getAdapter: (
		customOptions?: Omit<BetterAuthOptions, "database">,
	) => Promise<Adapter>;
	disableTests?: Partial<Record<keyof typeof adapterTests, boolean>>;
}

interface NumberIdAdapterTestOptions {
	getAdapter: (
		customOptions?: Omit<BetterAuthOptions, "database">,
	) => Promise<Adapter>;
	disableTests?: Partial<Record<keyof typeof numberIdAdapterTests, boolean>>;
	cleanUp: () => Promise<void>;
}

const adapterTests = {
	CREATE_MODEL: "create model",
	CREATE_MODEL_SHOULD_ALWAYS_RETURN_AN_ID:
		"create model should always return an id",
	FIND_MODEL: "find model",
	FIND_MODEL_WITHOUT_ID: "find model without id",
	FIND_MODEL_WITH_SELECT: "find model with select",
	FIND_MODEL_WITH_MODIFIED_FIELD_NAME: "find model with modified field name",
	UPDATE_MODEL: "update model",
	SHOULD_FIND_MANY: "should find many",
	SHOULD_FIND_MANY_WITH_WHERE: "should find many with where",
	SHOULD_FIND_MANY_WITH_OPERATORS: "should find many with operators",
	SHOULD_WORK_WITH_REFERENCE_FIELDS: "should work with reference fields",
	SHOULD_FIND_MANY_WITH_SORT_BY: "should find many with sortBy",
	SHOULD_FIND_MANY_WITH_LIMIT: "should find many with limit",
	SHOULD_FIND_MANY_WITH_OFFSET: "should find many with offset",
	SHOULD_UPDATE_WITH_MULTIPLE_WHERE: "should update with multiple where",
	DELETE_MODEL: "delete model",
	SHOULD_DELETE_MANY: "should delete many",
	SHOULD_NOT_THROW_ON_DELETE_RECORD_NOT_FOUND:
		"shouldn't throw on delete record not found",
	SHOULD_NOT_THROW_ON_RECORD_NOT_FOUND: "shouldn't throw on record not found",
	SHOULD_FIND_MANY_WITH_CONTAINS_OPERATOR:
		"should find many with contains operator",
	SHOULD_SEARCH_USERS_WITH_STARTS_WITH: "should search users with startsWith",
	SHOULD_SEARCH_USERS_WITH_ENDS_WITH: "should search users with endsWith",
	SHOULD_PREFER_GENERATE_ID_IF_PROVIDED: "should prefer generateId if provided",
} as const;

const { ...numberIdAdapterTestsCopy } = adapterTests;

const numberIdAdapterTests = {
	...numberIdAdapterTestsCopy,
	SHOULD_RETURN_A_NUMBER_ID_AS_A_RESULT:
		"Should return a number id as a result",
	SHOULD_INCREMENT_THE_ID_BY_1: "Should increment the id by 1",
} as const;

// @ts-ignore
// biome-ignore lint/performance/noDelete: <explanation>
delete numberIdAdapterTests.SHOULD_NOT_THROW_ON_DELETE_RECORD_NOT_FOUND;

async function adapterTest(
	{ getAdapter, disableTests: disabledTests }: AdapterTestOptions,
	internalOptions?: {
		predefinedOptions: Omit<BetterAuthOptions, "database">;
	},
) {
	const adapter = async () =>
		await getAdapter(internalOptions?.predefinedOptions);
	//@ts-expect-error - intentionally omitting id
	const user: {
		name: string;
		email: string;
		emailVerified: boolean;
		createdAt: Date;
		updatedAt: Date;
		id: string;
	} = {
		name: "user",
		email: "user@email.com",
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	test.skipIf(disabledTests?.CREATE_MODEL)(
		adapterTests.CREATE_MODEL,
		async () => {
			const res = await (await adapter()).create({
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
		},
	);

	test.skipIf(disabledTests?.CREATE_MODEL_SHOULD_ALWAYS_RETURN_AN_ID)(
		adapterTests.CREATE_MODEL_SHOULD_ALWAYS_RETURN_AN_ID,
		async () => {
			const res = await (await adapter()).create({
				model: "user",
				data: {
					name: "test-name-without-id",
					email: "test-email-without-id@email.com",
				},
			});
			expect(res).toHaveProperty("id");
			//@ts-ignore
			expect(typeof res?.id).toEqual("string");
		},
	);

	test.skipIf(disabledTests?.FIND_MODEL)(adapterTests.FIND_MODEL, async () => {
		const res = await (await adapter()).findOne<User>({
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

	test.skipIf(disabledTests?.FIND_MODEL_WITHOUT_ID)(
		adapterTests.FIND_MODEL_WITHOUT_ID,
		async () => {
			const res = await (await adapter()).findOne<User>({
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

	test.skipIf(disabledTests?.FIND_MODEL_WITH_MODIFIED_FIELD_NAME)(
		adapterTests.FIND_MODEL_WITH_MODIFIED_FIELD_NAME,
		async () => {
			const adapter = await getAdapter({
				user: {
					fields: {
						email: "email_address",
					},
				},
			});
			const user = await adapter.create({
				model: "user",
				data: {
					email: "test-email-with-modified-field@email.com",
					name: "test-name-with-modified-field",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			expect(user.email).toBe("test-email-with-modified-field@email.com");
			const res = await adapter.findOne<User>({
				model: "user",
				where: [
					{
						field: "email",
						value: "test-email-with-modified-field@email.com",
					},
				],
			});
			expect(res).not.toBeNull();
			expect(res?.email).toBe("test-email-with-modified-field@email.com");
		},
	);

	test.skipIf(disabledTests?.FIND_MODEL_WITH_SELECT)(
		adapterTests.FIND_MODEL_WITH_SELECT,
		async () => {
			const res = await (await adapter()).findOne({
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

	test.skipIf(disabledTests?.UPDATE_MODEL)(
		adapterTests.UPDATE_MODEL,
		async () => {
			const newEmail = "updated@email.com";

			const res = await (await adapter()).update<User>({
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
		},
	);

	test.skipIf(disabledTests?.SHOULD_FIND_MANY)(
		adapterTests.SHOULD_FIND_MANY,
		async () => {
			const res = await (await adapter()).findMany({
				model: "user",
			});
			expect(res.length).toBe(3);
		},
	);

	test.skipIf(disabledTests?.SHOULD_FIND_MANY_WITH_WHERE)(
		adapterTests.SHOULD_FIND_MANY_WITH_WHERE,
		async () => {
			const user = await (await adapter()).create<User>({
				model: "user",
				data: {
					name: "user2",
					email: "test@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const res = await (await adapter()).findMany({
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

	test.skipIf(disabledTests?.SHOULD_FIND_MANY_WITH_OPERATORS)(
		adapterTests.SHOULD_FIND_MANY_WITH_OPERATORS,
		async () => {
			const newUser = await (await adapter()).create<User>({
				model: "user",
				data: {
					name: "user",
					email: "test-email2@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const res = await (await adapter()).findMany({
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

	test.skipIf(disabledTests?.SHOULD_WORK_WITH_REFERENCE_FIELDS)(
		adapterTests.SHOULD_WORK_WITH_REFERENCE_FIELDS,
		async () => {
			let token = null;
			const user = await (await adapter()).create<Record<string, any>>({
				model: "user",
				data: {
					name: "user",
					email: "my-email@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const session = await (await adapter()).create({
				model: "session",
				data: {
					token: generateId(),
					createdAt: new Date(),
					updatedAt: new Date(),
					userId: user.id,
					expiresAt: new Date(),
				},
			});
			token = session.token;
			const res = await (await adapter()).findOne({
				model: "session",
				where: [
					{
						field: "userId",
						value: user.id,
					},
				],
			});
			const resToken = await (await adapter()).findOne({
				model: "session",
				where: [
					{
						field: "token",
						value: token,
					},
				],
			});
			expect(res).toMatchObject({
				userId: user.id,
			});
			expect(resToken).toMatchObject({
				userId: user.id,
			});

		},
	);

	test.skipIf(disabledTests?.SHOULD_FIND_MANY_WITH_SORT_BY)(
		adapterTests.SHOULD_FIND_MANY_WITH_SORT_BY,
		async () => {
			await (await adapter()).create({
				model: "user",
				data: {
					name: "a",
					email: "a@email.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const res = await (await adapter()).findMany<User>({
				model: "user",
				sortBy: {
					field: "name",
					direction: "asc",
				},
			});
			expect(res[0].name).toBe("a");

			const res2 = await (await adapter()).findMany<User>({
				model: "user",
				sortBy: {
					field: "name",
					direction: "desc",
				},
			});

			expect(res2[res2.length - 1].name).toBe("a");
		},
	);

	test.skipIf(disabledTests?.SHOULD_FIND_MANY_WITH_LIMIT)(
		adapterTests.SHOULD_FIND_MANY_WITH_LIMIT,
		async () => {
			const res = await (await adapter()).findMany({
				model: "user",
				limit: 1,
			});
			expect(res.length).toBe(1);
		},
	);

	test.skipIf(disabledTests?.SHOULD_FIND_MANY_WITH_OFFSET)(
		adapterTests.SHOULD_FIND_MANY_WITH_OFFSET,
		async () => {
			const res = await (await adapter()).findMany({
				model: "user",
				offset: 2,
			});
			expect(res.length).toBe(5);
		},
	);

	test.skipIf(disabledTests?.SHOULD_UPDATE_WITH_MULTIPLE_WHERE)(
		adapterTests.SHOULD_UPDATE_WITH_MULTIPLE_WHERE,
		async () => {
			await (await adapter()).updateMany({
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
			const updatedUser = await (await adapter()).findOne<User>({
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

	test.skipIf(disabledTests?.DELETE_MODEL)(
		adapterTests.DELETE_MODEL,
		async () => {
			await (await adapter()).delete({
				model: "user",
				where: [
					{
						field: "id",
						value: user.id,
					},
				],
			});
			const findRes = await (await adapter()).findOne({
				model: "user",
				where: [
					{
						field: "id",
						value: user.id,
					},
				],
			});
			expect(findRes).toBeNull();
		},
	);

	test.skipIf(disabledTests?.SHOULD_DELETE_MANY)(
		adapterTests.SHOULD_DELETE_MANY,
		async () => {
			for (const i of ["to-be-delete-1", "to-be-delete-2", "to-be-delete-3"]) {
				await (await adapter()).create({
					model: "user",
					data: {
						name: "to-be-deleted",
						email: `email@test-${i}.com`,
						emailVerified: true,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				});
			}
			const findResFirst = await (await adapter()).findMany({
				model: "user",
				where: [
					{
						field: "name",
						value: "to-be-deleted",
					},
				],
			});
			expect(findResFirst.length).toBe(3);
			await (await adapter()).deleteMany({
				model: "user",
				where: [
					{
						field: "name",
						value: "to-be-deleted",
					},
				],
			});
			const findRes = await (await adapter()).findMany({
				model: "user",
				where: [
					{
						field: "name",
						value: "to-be-deleted",
					},
				],
			});
			expect(findRes.length).toBe(0);
		},
	);

	test.skipIf(disabledTests?.SHOULD_NOT_THROW_ON_DELETE_RECORD_NOT_FOUND)(
		adapterTests.SHOULD_NOT_THROW_ON_DELETE_RECORD_NOT_FOUND,
		async () => {
			await (await adapter()).delete({
				model: "user",
				where: [
					{
						field: "id",
						value: "100000",
					},
				],
			});
		},
	);

	test.skipIf(disabledTests?.SHOULD_NOT_THROW_ON_RECORD_NOT_FOUND)(
		adapterTests.SHOULD_NOT_THROW_ON_RECORD_NOT_FOUND,
		async () => {
			const res = await (await adapter()).findOne({
				model: "user",
				where: [
					{
						field: "id",
						value: "100000",
					},
				],
			});
			expect(res).toBeNull();
		},
	);

	test.skipIf(disabledTests?.SHOULD_FIND_MANY_WITH_CONTAINS_OPERATOR)(
		adapterTests.SHOULD_FIND_MANY_WITH_CONTAINS_OPERATOR,
		async () => {
			const res = await (await adapter()).findMany({
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

	test.skipIf(disabledTests?.SHOULD_SEARCH_USERS_WITH_STARTS_WITH)(
		adapterTests.SHOULD_SEARCH_USERS_WITH_STARTS_WITH,
		async () => {
			const res = await (await adapter()).findMany({
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

	test.skipIf(disabledTests?.SHOULD_SEARCH_USERS_WITH_ENDS_WITH)(
		adapterTests.SHOULD_SEARCH_USERS_WITH_ENDS_WITH,
		async () => {
			const res = await (await adapter()).findMany({
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

	test.skipIf(disabledTests?.SHOULD_PREFER_GENERATE_ID_IF_PROVIDED)(
		adapterTests.SHOULD_PREFER_GENERATE_ID_IF_PROVIDED,
		async () => {
			const customAdapter = await getAdapter(
				Object.assign(
					{
						advanced: {
							database: {
								generateId: () => "mocked-id",
							},
						},
					} satisfies BetterAuthOptions,
					internalOptions?.predefinedOptions,
				),
			);

			const res = await customAdapter.create({
				model: "user",
				data: {
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

export async function runAdapterTest(opts: AdapterTestOptions) {
	return adapterTest(opts);
}

export async function runNumberIdAdapterTest(opts: NumberIdAdapterTestOptions) {
	describe("Should run number id specific tests", async () => {
		beforeAll(async () => {
			await opts.cleanUp();
		});
		const adapter = async () =>
			await opts.getAdapter({
				advanced: {
					database: {
						useNumberId: true,
					},
				},
			});
		let idNumber = -1;

		test.skipIf(opts.disableTests?.SHOULD_RETURN_A_NUMBER_ID_AS_A_RESULT)(
			numberIdAdapterTests.SHOULD_RETURN_A_NUMBER_ID_AS_A_RESULT,
			async () => {
				const res = await (await adapter()).create({
					model: "user",
					data: {
						name: "user",
						email: "user@email.com",
					},
				});
				expect(typeof res.id).toBe("string"); // we forcefully return all `id`s as strings. this is intentional.
				expect(parseInt(res.id)).toBeGreaterThan(0);
				idNumber = parseInt(res.id);
			},
		);
		test.skipIf(opts.disableTests?.SHOULD_INCREMENT_THE_ID_BY_1)(
			numberIdAdapterTests.SHOULD_INCREMENT_THE_ID_BY_1,
			async () => {
				const res = await (await adapter()).create({
					model: "user",
					data: {
						name: "user2",
						email: "user2@email.com",
					},
				});
				expect(parseInt(res.id)).toBe(idNumber + 1);
			},
		);
	});
	describe("Should run normal adapter tests with number id enabled", async () => {
		beforeAll(async () => {
			await opts.cleanUp();
		});
		await adapterTest(
			{
				...opts,
				disableTests: {
					...opts.disableTests,
					SHOULD_PREFER_GENERATE_ID_IF_PROVIDED: true,
				},
			},
			{
				predefinedOptions: {
					advanced: {
						database: {
							useNumberId: true,
						},
					},
				},
			},
		);
	});
}
