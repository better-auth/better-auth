import type { BetterAuthPlugin } from "@better-auth/core";
import { expect } from "vitest";
import type { Invitation, Member, Organization, Team } from "../../plugins";
import { organization } from "../../plugins";
import type { Account, Session, User } from "../../types";
import { createTestSuite } from "../create-test-suite";

/**
 * This test suite tests the basic CRUD operations of the adapter.
 */
export const normalTestSuite = createTestSuite(
	"normal",
	{},
	(helpers, debugTools?: { showDB?: () => Promise<void> }) => {
		const tests = getNormalTestSuiteTests(helpers, debugTools);
		return {
			"init - tests": async () => {
				const opts = helpers.getBetterAuthOptions();
				expect(
					!opts.advanced?.database?.useNumberId &&
						opts.advanced?.database?.generateId !== "serial",
				).toBeTruthy();
			},
			...tests,
		};
	},
);

export const getNormalTestSuiteTests = (
	{
		adapter,
		generate,
		insertRandom,
		modifyBetterAuthOptions,
		sortModels,
		customIdGenerator,
		getBetterAuthOptions,
		transformGeneratedModel,
		transformIdOutput,
	}: Parameters<Parameters<typeof createTestSuite>[2]>[0],
	debugTools?: { showDB?: () => Promise<void> },
) => {
	return {
		"create - should create a model": async () => {
			const user = await generate("user");
			// console.log(`pre-transformed:`, user);
			const result = await adapter.create<User>({
				model: "user",
				data: user,
				forceAllowId: true,
			});
			const options = getBetterAuthOptions();
			if (
				options.advanced?.database?.useNumberId ||
				options.advanced?.database?.generateId === "serial" ||
				options.advanced?.database?.generateId === "uuid"
			) {
				user.id = result.id;
			}

			expect(typeof result.id).toEqual("string");
			const transformed = transformGeneratedModel(user);
			// console.log(`transformed:`, transformed);
			// console.log(`result:`, result);
			expect(result).toEqual(transformed);
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
			expect(res.id).toEqual(transformIdOutput ? transformIdOutput(ID) : ID);
			const findResult = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: res.id }],
			});
			expect(findResult).toEqual(res);
		},
		"create - should return null for nullable foreign keys": {
			migrateBetterAuth: {
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
			test: async () => {
				const { nullableReference } = await adapter.create<{
					nullableReference: string | null;
				}>({
					model: "testModel",
					data: { nullableReference: null },
					forceAllowId: true,
				});
				expect(nullableReference).toBeNull();
			},
		},

		"create - should apply default values to fields": async () => {
			await modifyBetterAuthOptions(
				{
					user: {
						additionalFields: {
							testField: {
								type: "string",
								defaultValue: "test-value",
							},
							cbDefaultValueField: {
								type: "string",
								defaultValue: () => {
									return "advanced-test-value";
								},
							},
						},
					},
					plugins: [
						{
							id: "default-fields-test",
							schema: {
								testModel: {
									fields: {
										testField: {
											type: "string",
											defaultValue: "test-value",
										},
										cbDefaultValueField: {
											type: "string",
											defaultValue: () => {
												return "advanced-test-value";
											},
										},
									},
								},
							},
						},
					],
				},
				true,
			);
			const result = await adapter.create<{
				testField?: string;
				id: string;
				cbDefaultValueField?: string;
			}>({
				model: "testModel",
				data: {},
			});
			expect(result.id).toBeDefined();
			expect(result.id).toBeTypeOf("string");
			expect(result.testField).toBe("test-value");
			expect(result.cbDefaultValueField).toBe("advanced-test-value");

			const userResult = await adapter.create<
				User & { testField?: string; cbDefaultValueField?: string }
			>({
				model: "user",
				data: {
					...(await generate("user")),
				},
				forceAllowId: true,
			});
			expect(userResult).toBeDefined();
			expect(userResult?.testField).toBe("test-value");
			expect(userResult?.cbDefaultValueField).toBe("advanced-test-value");
		},
		"findOne - should find a model": async () => {
			const [user] = await insertRandom("user");
			const result = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: user.id }],
			});
			expect(result).toEqual(user);
		},
		"findOne - should not apply defaultValue if value not found": async () => {
			await modifyBetterAuthOptions(
				{
					user: {
						additionalFields: {
							testField: {
								type: "string",
								required: false,
								defaultValue: "test-value",
							},
							cbDefaultValueField: {
								type: "string",
								required: false,
								defaultValue: () => {
									return "advanced-test-value";
								},
							},
						},
					},
					plugins: [
						{
							id: "default-fields-test",
							schema: {
								testModel: {
									fields: {
										testField: {
											type: "string",
											required: false,
											defaultValue: "test-value",
										},
										cbDefaultValueField: {
											type: "string",
											required: false,
											defaultValue: () => {
												return "advanced-test-value";
											},
										},
									},
								},
							},
						},
					],
				},
				true,
			);
			const first = await adapter.create<{
				testField?: string | null;
				id: string;
				cbDefaultValueField?: string | null;
			}>({
				model: "testModel",
				data: {
					testField: null,
					cbDefaultValueField: null,
				},
			});
			const second = await adapter.create<
				User & {
					testField?: string | null;
					cbDefaultValueField?: string | null;
				}
			>({
				model: "user",
				data: {
					...(await generate("user")),
					testField: null,
					cbDefaultValueField: null,
				},
				forceAllowId: true,
			});

			const result = await adapter.findOne<{
				testField?: string;
				id: string;
				cbDefaultValueField?: string;
			}>({
				model: "testModel",
				where: [{ field: "id", value: first.id }],
			});
			expect(result).not.toBeNull();
			expect(result?.testField).toBeNull();
			expect(result?.cbDefaultValueField).toBeNull();

			const resultTwo = await adapter.findMany<
				User & {
					testField?: string | null;
					cbDefaultValueField?: string | null;
				}
			>({
				model: "user",
				where: [{ field: "id", value: second.id }],
			});
			expect(resultTwo).not.toBeNull();
			expect(resultTwo.length).toBe(1);
			expect(resultTwo[0]?.testField).toBeNull();
			expect(resultTwo[0]?.cbDefaultValueField).toBeNull();
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
			const options = getBetterAuthOptions();
			const useUUIDs = options.advanced?.database?.generateId === "uuid";
			const result = await adapter.findOne<User>({
				model: "user",
				where: [
					{ field: "id", value: useUUIDs ? crypto.randomUUID() : "100000" },
				],
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
		"findOne - should find a model with join": async () => {
			const users: User[] = [];
			const sessions: Session[] = [];
			const accounts: Account[] = [];
			let i = -1;
			for (const _ of Array.from({ length: 3 })) {
				i++;
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
					},
					forceAllowId: true,
				});
				users.push(user);
				const userId = users[0]!.id;
				const session = await adapter.create<Session>({
					model: "session",
					data: {
						...(await generate("session")),
						userId,
					},
					forceAllowId: true,
				});
				sessions.push(session);
				const account = await adapter.create<Account>({
					model: "account",
					data: {
						...(await generate("account")),
						userId,
					},
					forceAllowId: true,
				});
				accounts.push(account);
			}

			type ExpectedResult = User & { session: Session[]; account: Account[] };

			const result = await adapter.findOne<ExpectedResult>({
				model: "user",
				where: [{ field: "id", value: users[0]!.id }],
				join: {
					session: true,
					account: true,
				},
			});
			expect({
				...result,
				session: result?.session.sort((a, b) => a.id.localeCompare(b.id)),
				account: result?.account.sort((a, b) => a.id.localeCompare(b.id)),
			}).toEqual({
				...users[0]!,
				session: sessions.sort((a, b) => a.id.localeCompare(b.id)),
				account: accounts.sort((a, b) => a.id.localeCompare(b.id)),
			});
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
		"findOne - should find a model with modified model name": async () => {
			await modifyBetterAuthOptions(
				{
					user: {
						modelName: "user_custom",
					},
				},
				true,
			);
			const [user] = await insertRandom("user");
			expect(user).toBeDefined();
			expect(user).toHaveProperty("id");
			expect(user).toHaveProperty("name");
			const result = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: user.email }],
			});
			expect(result).toEqual(user);
			expect(result?.email).toEqual(user.email);
			expect(true).toEqual(true);
		},
		"findOne - should find a model with additional fields": async () => {
			await modifyBetterAuthOptions(
				{
					user: {
						additionalFields: {
							customField: {
								type: "string",
								input: false,
								required: true,
								defaultValue: "default-value",
							},
						},
					},
				},
				true,
			);
			const [user_] = await insertRandom("user");
			const user = user_ as User & { customField: string };
			expect(user).toHaveProperty("customField");
			expect(user.customField).toBe("default-value");
			const result = await adapter.findOne<User & { customField: string }>({
				model: "user",
				where: [{ field: "customField", value: user.customField }],
			});
			expect(result).toEqual(user);
			expect(result?.customField).toEqual("default-value");
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
		"findOne - should select fields with one-to-many join": async () => {
			const user = await adapter.create<User>({
				model: "user",
				data: { ...(await generate("user")) },
				forceAllowId: true,
			});
			const session = await adapter.create<Session>({
				model: "session",
				data: { ...(await generate("session")), userId: user.id },
				forceAllowId: true,
			});

			type ResultType = Pick<User, "email" | "name"> & {
				session: Session[];
			};

			const result = await adapter.findOne<ResultType>({
				model: "user",
				where: [{ field: "id", value: user.id }],
				select: ["email", "name"],
				join: { session: true },
			});

			expect(result).toBeDefined();
			expect(result?.email).toEqual(user.email);
			expect(result?.name).toEqual(user.name);
			expect(result?.session).toBeDefined();
			expect(Array.isArray(result?.session)).toBe(true);
			expect(result?.session).toHaveLength(1);
			expect(result?.session[0]).toEqual(session);
		},
		"findOne - should select fields with one-to-one join": async () => {
			await modifyBetterAuthOptions(
				{
					plugins: [
						{
							id: "one-to-one-test",
							schema: {
								oneToOneTable: {
									fields: {
										oneToOne: {
											type: "string",
											required: true,
											references: { field: "id", model: "user" },
											unique: true,
										},
									},
								},
							},
						} satisfies BetterAuthPlugin,
					],
				},
				true,
			);
			type OneToOneTable = { oneToOne: string };
			const user = await adapter.create<User>({
				model: "user",
				data: {
					...(await generate("user")),
				},
				forceAllowId: true,
			});

			const oneToOne = await adapter.create<OneToOneTable>({
				model: "oneToOneTable",
				data: {
					oneToOne: user.id,
				},
			});

			type ResultType = Pick<User, "email" | "name"> & {
				oneToOneTable: OneToOneTable;
			};

			const result = await adapter.findOne<ResultType>({
				model: "user",
				where: [{ field: "id", value: user.id }],
				select: ["email", "name"],
				join: { oneToOneTable: true },
			});

			expect(result).toBeDefined();
			expect(result?.email).toEqual(user.email);
			expect(result?.name).toEqual(user.name);
			expect(result?.oneToOneTable).toBeDefined();
			expect(result?.oneToOneTable).toEqual(oneToOne);
		},
		"findOne - should select fields with multiple joins": async () => {
			const user = await adapter.create<User>({
				model: "user",
				data: { ...(await generate("user")) },
				forceAllowId: true,
			});
			const session = await adapter.create<Session>({
				model: "session",
				data: { ...(await generate("session")), userId: user.id },
				forceAllowId: true,
			});
			const account = await adapter.create<Account>({
				model: "account",
				data: { ...(await generate("account")), userId: user.id },
				forceAllowId: true,
			});

			type ResultType = Pick<User, "email" | "name"> & {
				session: Session[];
				account: Account[];
			};

			const result = await adapter.findOne<ResultType>({
				model: "user",
				where: [{ field: "id", value: user.id }],
				select: ["email", "name"],
				join: { session: true, account: true },
			});

			expect(result).toBeDefined();
			expect(result?.email).toEqual(user.email);
			expect(result?.name).toEqual(user.name);
			expect(result?.session).toBeDefined();
			expect(Array.isArray(result?.session)).toBe(true);
			expect(result?.session).toHaveLength(1);
			expect(result?.session[0]).toEqual(session);
			expect(result?.account).toBeDefined();
			expect(Array.isArray(result?.account)).toBe(true);
			expect(result?.account).toHaveLength(1);
			expect(result?.account[0]).toEqual(account);
		},
		"findOne - should find model with date field": async () => {
			const [user] = await insertRandom("user");
			const result = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "createdAt", value: user.createdAt, operator: "eq" }],
			});
			expect(result).toEqual(user);
			expect(result?.createdAt).toBeInstanceOf(Date);
			expect(result?.createdAt).toEqual(user.createdAt);
		},
		"findOne - should perform backwards joins": async () => {
			const user = await adapter.create<User>({
				model: "user",
				data: { ...(await generate("user")) },
				forceAllowId: true,
			});
			const session = await adapter.create<Session>({
				model: "session",
				data: { ...(await generate("session")), userId: user.id },
				forceAllowId: true,
			});
			const result = await adapter.findOne<Session & { user: User }>({
				model: "session",
				where: [{ field: "token", value: session.token }],
				join: { user: true },
			});
			expect(result).toEqual({
				...session,
				user: user,
			});
		},
		"findOne - should return an object for one-to-one joins": async () => {
			await modifyBetterAuthOptions(
				{
					plugins: [
						{
							id: "one-to-one-test",
							schema: {
								oneToOneTable: {
									fields: {
										oneToOne: {
											type: "string",
											required: true,
											references: { field: "id", model: "user" },
											unique: true,
										},
									},
								},
							},
						} satisfies BetterAuthPlugin,
					],
				},
				true,
			);
			type OneToOneTable = { oneToOne: string };
			const users = (await insertRandom("user", 2)).map((x) => x[0]);
			const oneToOne = await adapter.create<OneToOneTable>({
				model: "oneToOneTable",
				data: {
					oneToOne: users[0]!.id,
				},
			});
			// decoy second table that shouldn't be included in the result
			await adapter.create<OneToOneTable>({
				model: "oneToOneTable",
				data: {
					oneToOne: users[1]!.id,
				},
			});
			const result = await adapter.findOne<
				User & { oneToOneTable: OneToOneTable }
			>({
				model: "user",
				where: [{ field: "id", value: users[0]!.id }],
				join: { oneToOneTable: true },
			});
			expect(result).toEqual({
				...users[0]!,
				oneToOneTable: oneToOne,
			});
		},
		"findOne - should return an array for one-to-many joins": async () => {
			const user = await adapter.create<User>({
				model: "user",
				data: { ...(await generate("user")) },
				forceAllowId: true,
			});
			const session = await adapter.create<Session>({
				model: "session",
				data: { ...(await generate("session")), userId: user.id },
				forceAllowId: true,
			});
			const result = await adapter.findOne<User & { session: Session }>({
				model: "user",
				where: [{ field: "id", value: user.id }],
				join: { session: true },
			});
			expect(result).toEqual({
				...user,
				session: [session],
			});
		},
		"findOne - should work with both one-to-one and one-to-many joins":
			async () => {
				await modifyBetterAuthOptions(
					{
						plugins: [
							{
								id: "one-to-one-test",
								schema: {
									oneToOneTable: {
										fields: {
											oneToOne: {
												type: "string",
												required: true,
												references: { field: "id", model: "user" },
												unique: true,
											},
										},
									},
								},
							} satisfies BetterAuthPlugin,
						],
					},
					true,
				);
				type OneToOneTable = { oneToOne: string };
				const users = (await insertRandom("user", 2)).map((x) => x[0]);
				const oneToOne = await adapter.create<OneToOneTable>({
					model: "oneToOneTable",
					data: {
						oneToOne: users[0]!.id,
					},
				});
				const session1 = await adapter.create<Session>({
					model: "session",
					data: {
						...(await generate("session")),
						userId: users[0]!.id,
						createdAt: new Date(Date.now() - 3000),
					},
					forceAllowId: true,
				});
				const session2 = await adapter.create<Session>({
					model: "session",
					data: {
						...(await generate("session")),
						userId: users[0]!.id,
						createdAt: new Date(Date.now() - 1000),
					},
					forceAllowId: true,
				});
				let result = await adapter.findOne<
					User & { oneToOneTable: OneToOneTable; session: Session[] }
				>({
					model: "user",
					where: [{ field: "id", value: users[0]!.id }],
					join: { oneToOneTable: true, session: true },
				});
				if (result?.session?.length) {
					result.session = result.session.sort(
						(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
					);
				}

				expect(result).toEqual({
					...users[0]!,
					oneToOneTable: oneToOne,
					session: [session1, session2],
				});
			},
		"findOne - should return null for failed base model lookup that has joins":
			async () => {
				await modifyBetterAuthOptions(
					{
						plugins: [
							{
								id: "one-to-one-test",
								schema: {
									oneToOneTable: {
										modelName: "one_to_one_table",
										fields: {
											oneToOne: {
												type: "string",
												required: true,
												references: { field: "id", model: "user" },
												unique: true,
											},
										},
									},
								},
							} satisfies BetterAuthPlugin,
						],
					},
					true,
				);

				const options = getBetterAuthOptions();
				const useUUIDs = options.advanced?.database?.generateId === "uuid";
				const result = await adapter.findOne<User>({
					model: "user",
					where: [
						{ field: "id", value: useUUIDs ? crypto.randomUUID() : "100000" },
					],
					join: { session: true, account: true, oneToOneTable: true },
				});
				expect(result).toBeNull();
			},
		"findOne - should join a model with modified field name": async () => {
			await modifyBetterAuthOptions(
				{
					user: {
						fields: {
							email: "email_address",
						},
					},
					plugins: [
						{
							id: "one-to-one-test",
							schema: {
								oneToOneTable: {
									modelName: "one_to_one_table",
									fields: {
										oneToOne: {
											type: "string",
											required: true,
											references: { field: "email", model: "user" },
											unique: true,
											fieldName: "one_to_one",
										},
									},
								},
							},
						} satisfies BetterAuthPlugin,
					],
				},
				true,
			);

			type OneToOneTable = { oneToOne: string; id: string };
			const user = await adapter.create<User>({
				model: "user",
				data: {
					...(await generate("user")),
				},
				forceAllowId: true,
			});

			const oneToOne = await adapter.create<OneToOneTable>({
				model: "oneToOneTable",
				data: {
					oneToOne: user.email,
				},
			});

			const result = await adapter.findOne<
				User & { oneToOneTable: OneToOneTable }
			>({
				model: "user",
				where: [{ field: "email", value: user.email }],
				join: { oneToOneTable: true },
			});
			expect(result).toEqual({
				...user,
				oneToOneTable: oneToOne,
			});
		},
		"findMany - should find many models": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
			});
			expect(sortModels(result)).toEqual(sortModels(users));
		},
		"findMany - should find many models with date fields": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const youngestUser = users.sort(
				(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
			)[0]!;
			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{ field: "createdAt", value: youngestUser.createdAt, operator: "lt" },
				],
			});
			expect(sortModels(result)).toEqual(
				sortModels(
					users.filter((user) => user.createdAt < youngestUser.createdAt),
				),
			);
		},
		"findMany - should find many models with join": async () => {
			type ExpectedResult = User & { session: Session[]; account: Account[] };
			let expectedResult: ExpectedResult[] = [];

			for (let i = 0; i < 10; i++) {
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						...(i < 3 ? { name: `join-user-${i}` } : {}),
					},
					forceAllowId: true,
				});
				let sessions: Session[] = [];
				for (let index = 0; index < 3; index++) {
					const session = await adapter.create<Session>({
						model: "session",
						data: { ...(await generate("session")), userId: user.id },
						forceAllowId: true,
					});
					sessions.push(session);
				}
				let accounts: Account[] = [];
				for (let index = 0; index < 3; index++) {
					const account = await adapter.create<Account>({
						model: "account",
						data: { ...(await generate("account")), userId: user.id },
						forceAllowId: true,
					});
					accounts.push(account);
				}

				if (i < 3) {
					expectedResult.push({
						...user,
						session: sessions,
						account: accounts,
					});
				}
			}

			let result = await adapter.findMany<ExpectedResult>({
				model: "user",
				where: [{ field: "name", value: "join-user", operator: "starts_with" }],
				join: {
					session: true,
					account: true,
				},
			});

			// sort both results since order in this case doesn't matter
			// but the test requires the order to be consistent
			const sort = (a: ExpectedResult, b: ExpectedResult) =>
				a.id.localeCompare(b.id);
			result = result.sort(sort);
			result = result.map((x) => ({
				...x,
				session: x.session.sort((a, b) => a.id.localeCompare(b.id)),
				account: x.account.sort((a, b) => a.id.localeCompare(b.id)),
			}));

			expectedResult = expectedResult.sort(sort);
			expectedResult = expectedResult.map((x) => ({
				...x,
				session: x.session.sort((a, b) => a.id.localeCompare(b.id)),
				account: x.account.sort((a, b) => a.id.localeCompare(b.id)),
			}));
			expect(result).toEqual(expectedResult);
		},
		"findMany - should find many with join and limit": async () => {
			const users: User[] = [];
			const sessionsByUser: Map<string, Session[]> = new Map();

			for (let i = 0; i < 5; i++) {
				const user = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				users.push(user);
				sessionsByUser.set(user.id, []);

				for (let j = 0; j < 3; j++) {
					const session = await adapter.create<Session>({
						model: "session",
						data: { ...(await generate("session")), userId: user.id },
						forceAllowId: true,
					});
					sessionsByUser.get(user.id)!.push(session);
				}
			}

			const result = await adapter.findMany<User & { session: Session[] }>({
				model: "user",
				join: { session: true },
				limit: 2,
			});

			expect(result).toHaveLength(2);
			result.forEach((user) => {
				expect(user.session).toHaveLength(3);
			});
		},
		"findMany - should find many with join and offset": async () => {
			const users: User[] = [];

			for (let i = 0; i < 5; i++) {
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						name: `user-${i.toString().padStart(2, "0")}`,
					},
					forceAllowId: true,
				});
				users.push(user);

				for (let j = 0; j < 2; j++) {
					await adapter.create<Session>({
						model: "session",
						data: { ...(await generate("session")), userId: user.id },
						forceAllowId: true,
					});
				}
			}

			const result = await adapter.findMany<User & { session: Session[] }>({
				model: "user",
				join: { session: true },
				offset: 2,
			});

			expect(result.length).toBe(3);
		},
		"findMany - should find many with join and sortBy": async () => {
			let n = -1;
			await modifyBetterAuthOptions(
				{
					user: {
						additionalFields: {
							numericField: {
								type: "number",
								defaultValue() {
									return ++n;
								},
							},
						},
					},
				},
				true,
			);

			const users: (User & { numericField: number })[] = [];
			for (let i = 0; i < 5; i++) {
				const user = (await adapter.create({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				} as any)) as User & { numericField: number };
				users.push(user);

				for (let j = 0; j < 2; j++) {
					await adapter.create<Session>({
						model: "session",
						data: { ...(await generate("session")), userId: user.id },
						forceAllowId: true,
					});
				}
			}

			const result = await adapter.findMany<
				(User & { session: Session[] }) & { numericField: number }
			>({
				model: "user",
				join: { session: true },
				sortBy: { field: "numericField", direction: "desc" },
			});

			expect(result[0]!.numericField).toBeGreaterThan(
				result[result.length - 1]!.numericField,
			);
			result.forEach((user) => {
				expect(user.session.length).toBeGreaterThan(0);
			});
		},
		"findMany - should find many with join and where clause": async () => {
			const users: User[] = [];

			for (let i = 0; i < 5; i++) {
				const user = await adapter.create<User>({
					model: "user",
					data: {
						...(await generate("user")),
						name: i < 2 ? `target-user-${i}` : `other-user-${i}`,
					},
					forceAllowId: true,
				});
				users.push(user);

				for (let j = 0; j < 2; j++) {
					await adapter.create<Session>({
						model: "session",
						data: { ...(await generate("session")), userId: user.id },
						forceAllowId: true,
					});
				}
			}

			const result = await adapter.findMany<User & { session: Session[] }>({
				model: "user",
				where: [
					{ field: "name", value: "target-user", operator: "starts_with" },
				],
				join: { session: true },
			});

			expect(result).toHaveLength(2);
			result.forEach((user) => {
				expect(user.name.startsWith("target-user")).toBe(true);
				expect(user.session).toHaveLength(2);
			});
		},
		"findMany - should find many with join, where, limit, and offset":
			async () => {
				const users: User[] = [];

				for (let i = 0; i < 10; i++) {
					const user = await adapter.create<User>({
						model: "user",
						data: {
							...(await generate("user")),
							name: `target-${i.toString().padStart(2, "0")}`,
						},
						forceAllowId: true,
					});
					users.push(user);

					for (let j = 0; j < 2; j++) {
						await adapter.create<Session>({
							model: "session",
							data: { ...(await generate("session")), userId: user.id },
							forceAllowId: true,
						});
					}
				}

				const result = await adapter.findMany<User & { session: Session[] }>({
					model: "user",
					where: [{ field: "name", value: "target", operator: "starts_with" }],
					join: { session: true },
					limit: 3,
					offset: 2,
				});

				expect(result).toHaveLength(3);
				result.forEach((user) => {
					expect(user.session).toHaveLength(2);
				});
			},
		"findMany - should find many with one-to-one join": async () => {
			await modifyBetterAuthOptions(
				{
					plugins: [
						{
							id: "one-to-one-test",
							schema: {
								oneToOneTable: {
									fields: {
										oneToOne: {
											type: "string",
											required: true,
											references: { field: "id", model: "user" },
											unique: true,
										},
									},
								},
							},
						} satisfies BetterAuthPlugin,
					],
				},
				true,
			);

			type OneToOneTable = { oneToOne: string; id: string };
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const oneToOneRecords: OneToOneTable[] = [];

			for (const user of users) {
				const record = await adapter.create<OneToOneTable>({
					model: "oneToOneTable",
					data: { oneToOne: user.id },
				});
				oneToOneRecords.push(record);
			}

			const result = await adapter.findMany<
				User & { oneToOneTable: OneToOneTable }
			>({
				model: "user",
				join: { oneToOneTable: true },
			});

			const resultsWithJoin = result.filter((r) => r.oneToOneTable);
			expect(resultsWithJoin).toHaveLength(3);
			resultsWithJoin.forEach((user) => {
				expect(user.oneToOneTable).toBeDefined();
				expect(user.oneToOneTable.oneToOne).toBe(user.id);
			});
		},
		"findMany - should find many with both one-to-one and one-to-many joins":
			async () => {
				await modifyBetterAuthOptions(
					{
						plugins: [
							{
								id: "one-to-one-test",
								schema: {
									oneToOneTable: {
										fields: {
											oneToOne: {
												type: "string",
												required: true,
												references: { field: "id", model: "user" },
												unique: true,
											},
										},
									},
								},
							} satisfies BetterAuthPlugin,
						],
					},
					true,
				);

				type OneToOneTable = { oneToOne: string; id: string };
				const users = (await insertRandom("user", 2)).map((x) => x[0]);

				for (const user of users) {
					await adapter.create<OneToOneTable>({
						model: "oneToOneTable",
						data: { oneToOne: user.id },
					});

					for (let i = 0; i < 2; i++) {
						await adapter.create<Session>({
							model: "session",
							data: { ...(await generate("session")), userId: user.id },
							forceAllowId: true,
						});
					}
				}

				const result = await adapter.findMany<
					User & { oneToOneTable: OneToOneTable; session: Session[] }
				>({
					model: "user",
					join: { oneToOneTable: true, session: true },
				});

				const resultsWithBothJoins = result.filter(
					(r) => r.oneToOneTable && r.session?.length > 0,
				);
				expect(resultsWithBothJoins.length).toBeGreaterThanOrEqual(2);
				resultsWithBothJoins.forEach((user) => {
					expect(user.oneToOneTable).toBeDefined();
					expect(Array.isArray(user.session)).toBe(true);
					expect(user.session.length).toBeGreaterThan(0);
				});
			},
		"findMany - should return an empty array when no models are found":
			async () => {
				const options = getBetterAuthOptions();
				const useUUIDs = options.advanced?.database?.generateId === "uuid";
				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{ field: "id", value: useUUIDs ? crypto.randomUUID() : "100000" },
					],
				});
				expect(result).toEqual([]);
			},
		"findMany - should return empty array when base records don't exist with joins":
			async () => {
				await modifyBetterAuthOptions(
					{
						plugins: [
							{
								id: "one-to-one-test",
								schema: {
									oneToOneTable: {
										fields: {
											oneToOne: {
												type: "string",
												required: true,
												references: { field: "id", model: "user" },
												unique: true,
											},
										},
									},
								},
							} satisfies BetterAuthPlugin,
						],
					},
					true,
				);
				const options = getBetterAuthOptions();
				const useUUIDs = options.advanced?.database?.generateId === "uuid";
				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{ field: "id", value: useUUIDs ? crypto.randomUUID() : "100000" },
					],
					join: { session: true, account: true, oneToOneTable: true },
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
		"findMany - starts_with should not interpret regex patterns": async () => {
			// Create a user whose name literally starts with the regex-like prefix
			const userTemplate = await generate("user");
			const literalRegexUser = await adapter.create<User>({
				model: "user",
				data: {
					...userTemplate,
					name: ".*danger",
				},
				forceAllowId: true,
			});

			// Also create some normal users that do NOT start with ".*"
			await insertRandom("user", 3);

			const result = await adapter.findMany<User>({
				model: "user",
				where: [{ field: "name", value: ".*", operator: "starts_with" }],
			});

			// Should only match the literal ".*" prefix, not treat it as a regex matching everything
			expect(result.length).toBe(1);
			expect(result[0]!.id).toBe(literalRegexUser.id);
			expect(result[0]!.name.startsWith(".*")).toBe(true);
		},
		"findMany - ends_with should not interpret regex patterns": async () => {
			// Create a user whose name literally ends with the regex-like suffix
			const userTemplate = await generate("user");
			const literalRegexUser = await adapter.create<User>({
				model: "user",
				data: {
					...userTemplate,
					name: "danger.*",
				},
				forceAllowId: true,
			});

			// Also create some normal users that do NOT end with ".*"
			await insertRandom("user", 3);

			const result = await adapter.findMany<User>({
				model: "user",
				where: [{ field: "name", value: ".*", operator: "ends_with" }],
			});

			// Should only match the literal ".*" suffix, not treat it as a regex matching everything
			expect(result.length).toBe(1);
			expect(result[0]!.id).toBe(literalRegexUser.id);
			expect(result[0]!.name.endsWith(".*")).toBe(true);
		},
		"findMany - contains should not interpret regex patterns": async () => {
			// Create a user whose name literally contains the regex-like pattern
			const userTemplate = await generate("user");
			const literalRegexUser = await adapter.create<User>({
				model: "user",
				data: {
					...userTemplate,
					name: "prefix-.*-suffix",
				},
				forceAllowId: true,
			});

			// Also create some normal users that do NOT contain ".*"
			await insertRandom("user", 3);

			const result = await adapter.findMany<User>({
				model: "user",
				where: [{ field: "name", value: ".*", operator: "contains" }],
			});

			// Should only match the literal substring ".*", not treat it as a regex matching everything
			expect(result.length).toBe(1);
			expect(result[0]!.id).toBe(literalRegexUser.id);
			expect(result[0]!.name.includes(".*")).toBe(true);
		},
		"findMany - should find many models with ends_with operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			for (const user of users) {
				const res = await adapter.update<User>({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { name: user.name.toLowerCase() }, // make name lowercase
				});
				if (!res) throw new Error("No result");
				let u = users.find((u) => u.id === user.id)!;
				u.name = res.name;
				u.updatedAt = res.updatedAt;
			}
			const ends_with = users[0]!.name.slice(-1);
			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "name",
						value: ends_with,
						operator: "ends_with",
					},
				],
			});
			const expectedResult = sortModels(
				users.filter((user) => user.name.endsWith(ends_with)),
			);
			if (result.length !== expectedResult.length) {
				console.log(`Result length: ${result.length}`);
				console.log(sortModels(result));
				console.log("--------------------------------");
				console.log(
					`Expected result length: ${expectedResult.length} - key: ${JSON.stringify(ends_with)}`,
				);
				console.log(expectedResult);
			}
			expect(sortModels(result)).toEqual(expectedResult);
		},
		"findMany - should find many models with contains operator": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);

			// if this check fails, the test will fail.
			// insertRandom needs to generate emails that contain `@email.com`
			expect(users[0]!.email).toContain("@email.com");

			const result = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "email",
						value: "mail", // all emails contains `@email.com` from `insertRandom`
						operator: "contains",
					},
				],
			});
			expect(sortModels(result)).toEqual(sortModels(users));
		},
		"findMany - should handle multiple where conditions with different operators":
			async () => {
				const testData = [
					{ name: "john doe", email: "john@example.com" },
					{ name: "jane smith", email: "jane@gmail.com" },
				];

				const createdUsers: User[] = [];
				for (const data of testData) {
					const user = await adapter.create({
						model: "user",
						data: {
							...generate("user"),
							...data,
						},
						forceAllowId: true,
					});
					createdUsers.push(user as User);
				}

				const result = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: "john@example.com",
							operator: "eq",
							connector: "AND",
						},
						{
							field: "name",
							value: "john",
							operator: "contains",
							connector: "AND",
						},
					],
				});
				expect(result.length).toBe(1);
				expect(result[0]!.email).toBe("john@example.com");
				expect(result[0]!.name).toBe("john doe");

				const result2 = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: "gmail",
							operator: "contains",
							connector: "AND",
						},
						{
							field: "name",
							value: "jane",
							operator: "contains",
							connector: "AND",
						},
					],
				});

				expect(result2.length).toBe(1);
				expect(result2[0]!.email).toBe("jane@gmail.com");
				expect(result2[0]!.name).toBe("jane smith");

				const result3 = await adapter.findMany<User>({
					model: "user",
					where: [
						{
							field: "email",
							value: "john",
							operator: "starts_with",
							connector: "AND",
						},
						{
							field: "name",
							value: "john",
							operator: "contains",
							connector: "AND",
						},
					],
				});

				expect(result3.length).toBe(1);
				expect(result3[0]!.email).toBe("john@example.com");
				expect(result3[0]!.name).toBe("john doe");
			},
		"findMany - should find many models with contains operator (using symbol)":
			async () => {
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
			let n = -1;
			await modifyBetterAuthOptions(
				{
					user: {
						additionalFields: {
							numericField: {
								type: "number",
								defaultValue() {
									return n++;
								},
							},
						},
					},
				},
				true,
			);
			const users = (await insertRandom("user", 5)).map(
				(x) => x[0],
			) as (User & { numericField: number })[];
			const result = await adapter.findMany<User & { numericField: number }>({
				model: "user",
				sortBy: { field: "numericField", direction: "asc" },
			});
			const expectedResult = users
				.map((x) => x.numericField)
				.sort((a, b) => a - b);
			try {
				expect(result.map((x) => x.numericField)).toEqual(expectedResult);
			} catch (error) {
				console.log(`--------------------------------`);
				console.log(`result:`);
				console.log(result.map((x) => x.id));
				console.log(`expected result:`);
				console.log(expectedResult);
				console.log(`--------------------------------`);
				throw error;
			}
			const options = getBetterAuthOptions();
			if (
				options.advanced?.database?.useNumberId ||
				options.advanced?.database?.generateId === "serial"
			) {
				expect(Number(users[0]!.id)).not.toBeNaN();
			}
		},
		"findMany - should find many models with limit": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			const result = await adapter.findMany<User>({
				model: "user",
				limit: 2,
			});
			expect(result.length).toEqual(2);
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
			let n = -1;
			await modifyBetterAuthOptions(
				{
					user: {
						additionalFields: {
							numericField: {
								type: "number",
								defaultValue() {
									return n++;
								},
							},
						},
					},
				},
				true,
			);
			const users = (await insertRandom("user", 5)).map(
				(x) => x[0],
			) as (User & { numericField: number })[];
			const result = await adapter.findMany<User>({
				model: "user",
				sortBy: { field: "numericField", direction: "asc" },
				offset: 2,
			});
			expect(result).toHaveLength(3);
			expect(result).toEqual(
				users.sort((a, b) => a.numericField - b.numericField).slice(2),
			);
		},
		"findMany - should find many models with sortBy and limit": async () => {
			let n = -1;
			await modifyBetterAuthOptions(
				{
					user: {
						additionalFields: {
							numericField: {
								type: "number",
								defaultValue() {
									return n++;
								},
							},
						},
					},
				},
				true,
			);
			const users = (await insertRandom("user", 5)).map(
				(x) => x[0],
			) as (User & { numericField: number })[];
			const result = await adapter.findMany<User>({
				model: "user",
				sortBy: { field: "numericField", direction: "asc" },
				limit: 2,
			});
			expect(result).toEqual(
				users.sort((a, b) => a.numericField - b.numericField).slice(0, 2),
			);
		},
		"findMany - should find many models with sortBy and limit and offset":
			async () => {
				let n = -1;
				await modifyBetterAuthOptions(
					{
						user: {
							additionalFields: {
								numericField: {
									type: "number",
									defaultValue() {
										return n++;
									},
								},
							},
						},
					},
					true,
				);
				const users = (await insertRandom("user", 5)).map(
					(x) => x[0],
				) as (User & { numericField: number })[];
				const result = await adapter.findMany<User>({
					model: "user",
					sortBy: { field: "numericField", direction: "asc" },
					limit: 2,
					offset: 2,
				});
				expect(result.length).toBe(2);
				expect(result).toEqual(
					users.sort((a, b) => a.numericField - b.numericField).slice(2, 4),
				);
			},
		"findMany - should find many models with sortBy and limit and offset and where":
			async () => {
				let n = -1;
				await modifyBetterAuthOptions(
					{
						user: {
							additionalFields: {
								numericField: {
									type: "number",
									defaultValue() {
										return n++;
									},
								},
							},
						},
					},
					true,
				);
				let users = (await insertRandom("user", 10)).map(
					(x) => x[0],
				) as (User & { numericField: number })[];

				// update the last three users to end with "last"
				let i = -1;
				for (const user of users) {
					i++;
					if (i < 5) continue;
					const result = await adapter.update<User>({
						model: "user",
						where: [{ field: "id", value: user.id }],
						update: { name: user.name + "-last" },
					});
					if (!result) throw new Error("No result");
					users[i]!.name = result.name;
					users[i]!.updatedAt = result.updatedAt;
				}

				const result = await adapter.findMany<User & { numericField: number }>({
					model: "user",
					sortBy: { field: "numericField", direction: "asc" },
					limit: 2,
					offset: 2,
					where: [{ field: "name", value: "last", operator: "ends_with" }],
				});

				// Order of operation for most DBs:
				// FROM → WHERE → SORT BY → OFFSET → LIMIT

				let expectedResult: any[] = [];
				expectedResult = users
					.filter((user) => user.name.endsWith("last"))
					.sort((a, b) => a.numericField - b.numericField)
					.slice(2, 4);

				try {
					expect(result.length).toBe(2);
					expect(result).toEqual(expectedResult);
				} catch (error) {
					console.log(`--------------------------------`);
					console.log(`results:`);
					console.log(result.map((x) => x.id));
					console.log(`expected results, sorted:`);
					console.log(
						users
							.filter((x) => x.name.toString().endsWith("last"))
							.map((x) => x.numericField)
							.sort((a, b) => a - b),
					);
					console.log(`expected results, sorted + offset:`);
					console.log(
						users
							.filter((x) => x.name.toString().endsWith("last"))
							.map((x) => x.numericField)
							.sort((a, b) => a - b)
							.slice(2, 4),
					);
					console.log(`--------------------------------`);
					console.log("FAIL", error);
					console.log(`--------------------------------`);
					throw error;
				}
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
			const options = getBetterAuthOptions();
			const useUUIDs = options.advanced?.database?.generateId === "uuid";
			await expect(
				adapter.delete({
					model: "user",
					where: [
						{ field: "id", value: useUUIDs ? crypto.randomUUID() : "100000" },
					],
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
		"deleteMany - starts_with should not interpret regex patterns":
			async () => {
				// Create a user whose name literally starts with the regex-like prefix
				const userTemplate = await generate("user");
				const literalRegexUser = await adapter.create<User>({
					model: "user",
					data: {
						...userTemplate,
						name: ".*danger",
					},
					forceAllowId: true,
				});

				// Also create some normal users that do NOT start with ".*"
				const normalUsers = (await insertRandom("user", 3)).map((x) => x[0]);

				await adapter.deleteMany({
					model: "user",
					where: [{ field: "name", value: ".*", operator: "starts_with" }],
				});

				// The literal ".*danger" user should be deleted
				const deleted = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: literalRegexUser.id }],
				});
				expect(deleted).toBeNull();

				// Normal users should remain
				for (const user of normalUsers) {
					const stillThere = await adapter.findOne<User>({
						model: "user",
						where: [{ field: "id", value: user.id }],
					});
					expect(stillThere).not.toBeNull();
				}
			},
		"deleteMany - ends_with should not interpret regex patterns": async () => {
			// Create a user whose name literally ends with the regex-like suffix
			const userTemplate = await generate("user");
			const literalRegexUser = await adapter.create<User>({
				model: "user",
				data: {
					...userTemplate,
					name: "danger.*",
				},
				forceAllowId: true,
			});

			const normalUsers = (await insertRandom("user", 3)).map((x) => x[0]);

			await adapter.deleteMany({
				model: "user",
				where: [{ field: "name", value: ".*", operator: "ends_with" }],
			});

			const deleted = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: literalRegexUser.id }],
			});
			expect(deleted).toBeNull();

			for (const user of normalUsers) {
				const stillThere = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: user.id }],
				});
				expect(stillThere).not.toBeNull();
			}
		},
		"deleteMany - contains should not interpret regex patterns": async () => {
			// Create a user whose name literally contains the regex-like pattern
			const userTemplate = await generate("user");
			const literalRegexUser = await adapter.create<User>({
				model: "user",
				data: {
					...userTemplate,
					name: "prefix-.*-suffix",
				},
				forceAllowId: true,
			});

			const normalUsers = (await insertRandom("user", 3)).map((x) => x[0]);

			await adapter.deleteMany({
				model: "user",
				where: [{ field: "name", value: ".*", operator: "contains" }],
			});

			const deleted = await adapter.findOne<User>({
				model: "user",
				where: [{ field: "id", value: literalRegexUser.id }],
			});
			expect(deleted).toBeNull();

			for (const user of normalUsers) {
				const stillThere = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: user.id }],
				});
				expect(stillThere).not.toBeNull();
			}
		},
		"deleteMany - should delete many models with numeric values": async () => {
			let i = 0;
			await modifyBetterAuthOptions(
				{
					user: {
						additionalFields: {
							numericField: {
								type: "number",
								defaultValue() {
									return i++;
								},
							},
						},
					},
				},
				true,
			);
			const users = (await insertRandom("user", 3)).map(
				(x) => x[0],
			) as (User & { numericField: number })[];
			if (!users[0] || !users[1] || !users[2]) {
				expect(false).toBe(true);
				throw new Error("Users not found");
			}
			expect(users[0].numericField).toEqual(0);
			expect(users[1].numericField).toEqual(1);
			expect(users[2].numericField).toEqual(2);

			await adapter.deleteMany({
				model: "user",
				where: [
					{
						field: "numericField",
						value: users[0].numericField,
						operator: "gt",
					},
				],
			});

			const result = await adapter.findMany<User>({
				model: "user",
			});
			expect(result).toEqual([users[0]]);
		},
		"deleteMany - should delete many models with boolean values": async () => {
			const users = (await insertRandom("user", 3)).map((x) => x[0]);
			// in this test, we have 3 users, two of which have emailVerified set to true and one to false
			// delete all that has emailVerified set to true, and expect users[1] to be the only one left
			if (!users[0] || !users[1] || !users[2]) {
				expect(false).toBe(true);
				throw new Error("Users not found");
			}
			await adapter.updateMany({
				model: "user",
				where: [],
				update: { emailVerified: true },
			});
			await adapter.update({
				model: "user",
				where: [{ field: "id", value: users[1].id }],
				update: { emailVerified: false },
			});
			await adapter.deleteMany({
				model: "user",
				where: [{ field: "emailVerified", value: true }],
			});
			const result = await adapter.findMany<User>({
				model: "user",
			});
			expect(result).toHaveLength(1);
			expect(result.find((user) => user.id === users[0]?.id)).toBeUndefined();
			expect(result.find((user) => user.id === users[1]?.id)).toBeDefined();
			expect(result.find((user) => user.id === users[2]?.id)).toBeUndefined();
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
		"findOne - backwards join should only return single record not array":
			async () => {
				const user = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				const session = await adapter.create<Session>({
					model: "session",
					data: { ...(await generate("session")), userId: user.id },
					forceAllowId: true,
				});

				const result = await adapter.findOne<Session & { user: User }>({
					model: "session",
					where: [{ field: "id", value: session.id }],
					join: { user: true },
				});

				expect(result?.user).toBeDefined();
				expect(Array.isArray(result?.user)).toBe(false);
				expect(result?.user?.id).toBe(user.id);
			},
		"findMany - backwards join should only return single record not array":
			async () => {
				const users = (await insertRandom("user", 2)).map((x) => x[0]);
				const sessions: Session[] = [];

				for (const user of users) {
					const session = await adapter.create<Session>({
						model: "session",
						data: { ...(await generate("session")), userId: user.id },
						forceAllowId: true,
					});
					sessions.push(session);
				}

				const result = await adapter.findMany<Session & { user: User }>({
					model: "session",
					join: { user: true },
				});

				result.forEach((session) => {
					expect(session.user).toBeDefined();
					expect(Array.isArray(session.user)).toBe(false);
					expect(session.user?.id).toBeDefined();
				});
			},
		"findOne - backwards join with modified field name (session base, users-table join)":
			async () => {
				await modifyBetterAuthOptions(
					{
						user: {
							modelName: "user_table",
						},
					},
					true,
				);
				const user = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				const session = await adapter.create<Session>({
					model: "session",
					data: { ...(await generate("session")), userId: user.id },
					forceAllowId: true,
				});

				const result = await adapter.findOne<Session & { user: User }>({
					model: "session",
					where: [{ field: "id", value: session.id }],
					join: { user: true },
				});

				expect(result).toEqual({
					...session,
					user: user,
				});
				expect(result?.user).toBeDefined();
				expect(Array.isArray(result?.user)).toBe(false);
				expect(result?.user?.id).toBe(user.id);
			},
		"findOne - multiple joins should return result even when some joined tables have no matching rows":
			async () => {
				await modifyBetterAuthOptions(
					{
						plugins: [organization({ teams: { enabled: true } })],
					},
					true,
				);

				// Create a user and organization
				const user = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});

				const organizationData = await adapter.create<Organization>({
					model: "organization",
					data: {
						name: "Test Organization",
						slug: "test-org-" + Math.random(),
						createdAt: new Date(),
					},
					forceAllowId: true,
				});

				// Add a member to the organization
				const member = await adapter.create<Member>({
					model: "member",
					data: {
						organizationId: organizationData.id,
						userId: user.id,
						role: "owner",
						createdAt: new Date(),
					},
					forceAllowId: true,
				});

				// Create a team for the organization
				const team = await adapter.create<Team>({
					model: "team",
					data: {
						name: "Test Team",
						organizationId: organizationData.id,
						createdAt: new Date(),
					},
					forceAllowId: true,
				});

				// Do NOT create any invitations - leave it empty

				// Query the organization with joins to member, team, and invitation
				type ResultType = Organization & {
					member: Member[];
					team: Team[];
					invitation: Invitation[];
				};

				const result = await adapter.findOne<ResultType>({
					model: "organization",
					where: [{ field: "id", value: organizationData.id }],
					join: {
						member: true,
						team: true,
						invitation: true,
					},
				});

				expect(result).toBeDefined();
				expect(result?.id).toBe(organizationData.id);
				expect(result?.name).toBe("Test Organization");

				// Verify member join worked
				expect(Array.isArray(result?.member)).toBe(true);
				expect(result?.member).toHaveLength(1);
				expect(result?.member[0]?.userId).toBe(user.id);
				expect(result?.member[0]?.role).toBe("owner");

				// Verify team join worked
				expect(Array.isArray(result?.team)).toBe(true);
				expect(result?.team).toHaveLength(1);
				expect(result?.team[0]?.name).toBe("Test Team");

				// Verify invitation is empty array
				expect(Array.isArray(result?.invitation)).toBe(true);
				expect(result?.invitation).toHaveLength(0);
			},
		"findOne - should be able to perform a limited join": async () => {
			const user = await adapter.create<User>({
				model: "user",
				data: { ...(await generate("user")) },
				forceAllowId: true,
			});

			for (let i = 0; i < 5; i++) {
				await adapter.create<Session>({
					model: "session",
					data: { ...(await generate("session")), userId: user.id },
					forceAllowId: true,
				});
			}

			const result = await adapter.findOne<User & { session: Session[] }>({
				model: "user",
				where: [{ field: "id", value: user.id }],
				join: {
					session: { limit: 2 },
				},
			});

			expect(result).toBeDefined();
			expect(result?.session).toBeDefined();
			expect(result?.session).toHaveLength(2);
			expect(result?.session[0]?.userId).toBe(user.id);
		},
		"findOne - should be able to perform a complex limited join": async () => {
			const user = await adapter.create<User>({
				model: "user",
				data: { ...(await generate("user")) },
				forceAllowId: true,
			});

			for (let i = 0; i < 5; i++) {
				await adapter.create<Session>({
					model: "session",
					data: { ...(await generate("session")), userId: user.id },
					forceAllowId: true,
				});
				await adapter.create<Account>({
					model: "account",
					data: { ...(await generate("account")), userId: user.id },
					forceAllowId: true,
				});
			}

			const result = await adapter.findOne<
				User & { session: Session[]; account: Account[] }
			>({
				model: "user",
				where: [{ field: "id", value: user.id }],
				join: {
					session: { limit: 2 },
					account: { limit: 3 },
				},
			});
			expect(result).toBeDefined();
			expect(result?.session).toBeDefined();
			expect(result?.session).toHaveLength(2);
			expect(result?.account).toBeDefined();
			expect(result?.account).toHaveLength(3);
		},
		"findMany - should be able to perform a limited join": async () => {
			const users: User[] = [];

			for (let i = 0; i < 5; i++) {
				const user = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				users.push(user);
			}
			const sessionsByUser: Map<string, Session[]> = new Map();
			for (const user of users) {
				sessionsByUser.set(user.id, []);
				for (let i = 0; i < 5; i++) {
					const session = await adapter.create<Session>({
						model: "session",
						data: { ...(await generate("session")), userId: user.id },
						forceAllowId: true,
					});
					sessionsByUser.get(user.id)!.push(session);
				}
			}
			const result = await adapter.findMany<User & { session: Session[] }>({
				model: "user",
				join: { session: { limit: 2 } },
			});
			expect(result).toBeDefined();
			expect(result).toHaveLength(5);
			result.forEach((user) => {
				expect(user.session).toBeDefined();
				expect(user.session).toHaveLength(2);
				expect(user.session[0]?.userId).toBe(user.id);
			});
		},
		"findMany - should be able to perform a complex limited join": async () => {
			const users: User[] = [];
			const sessionsByUser: Map<string, Session[]> = new Map();
			const accountsByUser: Map<string, Account[]> = new Map();
			for (let i = 0; i < 5; i++) {
				const user = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				users.push(user);
				sessionsByUser.set(user.id, []);
				accountsByUser.set(user.id, []);
				for (let i = 0; i < 5; i++) {
					const session = await adapter.create<Session>({
						model: "session",
						data: { ...(await generate("session")), userId: user.id },
						forceAllowId: true,
					});
					sessionsByUser.get(user.id)!.push(session);
					const account = await adapter.create<Account>({
						model: "account",
						data: { ...(await generate("account")), userId: user.id },
						forceAllowId: true,
					});
					accountsByUser.get(user.id)!.push(account);
				}
			}
			type ResultType = User & { session: Session[]; account: Account[] };
			const result = await adapter.findMany<ResultType>({
				model: "user",
				join: {
					session: { limit: 2 },
					account: { limit: 3 },
				},
				limit: 2,
				offset: 2,
			});
			expect(result).toBeDefined();
			expect(result).toHaveLength(2);
			result.forEach((user) => {
				expect(user.session).toBeDefined();
				expect(user.session).toHaveLength(2);
				expect(user.session[0]?.userId).toBe(user.id);
				expect(user.account).toBeDefined();
				expect(user.account).toHaveLength(3);
				expect(user.account[0]?.userId).toBe(user.id);
			});
		},
		"findOne - should return null for one-to-one join when joined record doesn't exist":
			async () => {
				await modifyBetterAuthOptions(
					{
						plugins: [
							{
								id: "one-to-one-test",
								schema: {
									oneToOneTable: {
										fields: {
											oneToOne: {
												type: "string",
												required: true,
												references: { field: "id", model: "user" },
												unique: true,
											},
										},
									},
								},
							} satisfies BetterAuthPlugin,
						],
					},
					true,
				);
				type OneToOneTable = { oneToOne: string; id: string };
				// Create a user without a corresponding one-to-one record
				const user = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});

				const result = await adapter.findOne<
					User & { oneToOneTable: OneToOneTable | null }
				>({
					model: "user",
					where: [{ field: "id", value: user.id }],
					join: { oneToOneTable: true },
				});

				expect(result).toBeDefined();
				expect(result?.id).toBe(user.id);
				expect(result?.oneToOneTable).toBeNull();
			},
		"findMany - should return null for one-to-one join when joined records don't exist":
			async () => {
				await modifyBetterAuthOptions(
					{
						plugins: [
							{
								id: "one-to-one-test",
								schema: {
									oneToOneTable: {
										fields: {
											oneToOne: {
												type: "string",
												required: true,
												references: { field: "id", model: "user" },
												unique: true,
											},
										},
									},
								},
							} satisfies BetterAuthPlugin,
						],
					},
					true,
				);
				type OneToOneTable = { oneToOne: string; id: string };
				// Create multiple users - some with one-to-one records, some without
				const userWithJoin = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				const oneToOne = await adapter.create<OneToOneTable>({
					model: "oneToOneTable",
					data: { oneToOne: userWithJoin.id },
				});

				const userWithoutJoin = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});

				const result = await adapter.findMany<
					User & { oneToOneTable: OneToOneTable | null }
				>({
					model: "user",
					where: [
						{ field: "id", value: userWithJoin.id, connector: "OR" },
						{ field: "id", value: userWithoutJoin.id, connector: "OR" },
					],
					join: { oneToOneTable: true },
				});

				expect(result).toBeDefined();
				expect(result.length).toBe(2);

				const resultWithJoin = result.find((u) => u.id === userWithJoin.id);
				const resultWithoutJoin = result.find(
					(u) => u.id === userWithoutJoin.id,
				);

				expect(resultWithJoin).toBeDefined();
				expect(resultWithJoin?.oneToOneTable).toBeDefined();
				expect(resultWithJoin?.oneToOneTable?.id).toBe(oneToOne.id);

				expect(resultWithoutJoin).toBeDefined();
				expect(resultWithoutJoin?.oneToOneTable).toBeNull();
			},
		"findMany - should return empty array for one-to-many join when joined records don't exist":
			async () => {
				// Create multiple users - some with sessions, some without
				const userWithSessions = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				const session1 = await adapter.create<Session>({
					model: "session",
					data: { ...(await generate("session")), userId: userWithSessions.id },
					forceAllowId: true,
				});
				const session2 = await adapter.create<Session>({
					model: "session",
					data: { ...(await generate("session")), userId: userWithSessions.id },
					forceAllowId: true,
				});

				const userWithoutSessions = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});

				const result = await adapter.findMany<User & { session: Session[] }>({
					model: "user",
					where: [
						{ field: "id", value: userWithSessions.id, connector: "OR" },
						{ field: "id", value: userWithoutSessions.id, connector: "OR" },
					],
					join: { session: true },
				});

				expect(result).toBeDefined();
				expect(result.length).toBe(2);

				const resultWithSessions = result.find(
					(u) => u.id === userWithSessions.id,
				);
				const resultWithoutSessions = result.find(
					(u) => u.id === userWithoutSessions.id,
				);

				expect(resultWithSessions).toBeDefined();
				expect(Array.isArray(resultWithSessions?.session)).toBe(true);
				expect(resultWithSessions?.session).toHaveLength(2);
				expect(
					resultWithSessions?.session.some((s) => s.id === session1.id),
				).toBe(true);
				expect(
					resultWithSessions?.session.some((s) => s.id === session2.id),
				).toBe(true);

				expect(resultWithoutSessions).toBeDefined();
				expect(Array.isArray(resultWithoutSessions?.session)).toBe(true);
				expect(resultWithoutSessions?.session).toHaveLength(0);
			},
		"findMany - should handle mixed joins correctly when some are missing":
			async () => {
				await modifyBetterAuthOptions(
					{
						plugins: [
							{
								id: "one-to-one-test",
								schema: {
									oneToOneTable: {
										fields: {
											oneToOne: {
												type: "string",
												required: true,
												references: { field: "id", model: "user" },
												unique: true,
											},
										},
									},
								},
							} satisfies BetterAuthPlugin,
						],
					},
					true,
				);
				type OneToOneTable = { oneToOne: string; id: string };

				// User 1: Has both one-to-one and one-to-many joins
				const user1 = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				const oneToOne1 = await adapter.create<OneToOneTable>({
					model: "oneToOneTable",
					data: { oneToOne: user1.id },
				});
				const session1 = await adapter.create<Session>({
					model: "session",
					data: { ...(await generate("session")), userId: user1.id },
					forceAllowId: true,
				});

				// User 2: Has one-to-one but no one-to-many
				const user2 = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				const oneToOne2 = await adapter.create<OneToOneTable>({
					model: "oneToOneTable",
					data: { oneToOne: user2.id },
				});

				// User 3: Has one-to-many but no one-to-one
				const user3 = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});
				const session3 = await adapter.create<Session>({
					model: "session",
					data: { ...(await generate("session")), userId: user3.id },
					forceAllowId: true,
				});

				// User 4: Has neither join
				const user4 = await adapter.create<User>({
					model: "user",
					data: { ...(await generate("user")) },
					forceAllowId: true,
				});

				const result = await adapter.findMany<
					User & { oneToOneTable: OneToOneTable | null; session: Session[] }
				>({
					model: "user",
					where: [
						{ field: "id", value: user1.id, connector: "OR" },
						{ field: "id", value: user2.id, connector: "OR" },
						{ field: "id", value: user3.id, connector: "OR" },
						{ field: "id", value: user4.id, connector: "OR" },
					],
					join: { oneToOneTable: true, session: true },
				});

				expect(result).toBeDefined();
				expect(result.length).toBe(4);

				// User 1: Has both
				const result1 = result.find((u) => u.id === user1.id);
				expect(result1).toBeDefined();
				expect(result1?.oneToOneTable).toBeDefined();
				expect(result1?.oneToOneTable?.id).toBe(oneToOne1.id);
				expect(Array.isArray(result1?.session)).toBe(true);
				expect(result1?.session).toHaveLength(1);
				expect(result1?.session[0]?.id).toBe(session1.id);

				// User 2: Has one-to-one, no one-to-many
				const result2 = result.find((u) => u.id === user2.id);
				expect(result2).toBeDefined();
				expect(result2?.oneToOneTable).toBeDefined();
				expect(result2?.oneToOneTable?.id).toBe(oneToOne2.id);
				expect(Array.isArray(result2?.session)).toBe(true);
				expect(result2?.session).toHaveLength(0);

				// User 3: Has one-to-many, no one-to-one
				const result3 = result.find((u) => u.id === user3.id);
				expect(result3).toBeDefined();
				expect(result3?.oneToOneTable).toBeNull();
				expect(Array.isArray(result3?.session)).toBe(true);
				expect(result3?.session).toHaveLength(1);
				expect(result3?.session[0]?.id).toBe(session3.id);

				// User 4: Has neither
				const result4 = result.find((u) => u.id === user4.id);
				expect(result4).toBeDefined();
				expect(result4?.oneToOneTable).toBeNull();
				expect(Array.isArray(result4?.session)).toBe(true);
				expect(result4?.session).toHaveLength(0);
			},
	};
};

const getTestKeys = () => Object.keys(getNormalTestSuiteTests({} as any));
type TestKeys = Partial<
	Record<keyof ReturnType<typeof getNormalTestSuiteTests>, boolean>
>;

export const enableJoinTests = getTestKeys().reduce((acc, test) => {
	if (test.includes("join")) {
		acc[test as keyof TestKeys] = false;
	}
	return acc;
}, {} as TestKeys);
