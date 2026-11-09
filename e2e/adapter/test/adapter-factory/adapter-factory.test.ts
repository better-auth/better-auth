import type { BetterAuthOptions } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import type {
	AdapterFactoryConfig,
	AdapterFactoryCustomizeAdapterCreator,
	CustomAdapter,
	DBAdapter,
} from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import { betterAuth } from "better-auth";
import { describe, expect, test, vi } from "vitest";

/*

Note that there are basically 2 types of tests here:

1. Making sure that the data within each adapter call is correct. (Transformed to suit the DB, accurate according to the schema, etc.)
2. Making sure the output of each adapter call is correct. (The data is transformed back to the correct format, etc.)

The rest are just edge cases.

*/

/**
 * `Mock` resolves the generics of the function it wraps, so a typed
 * `vi.fn<CustomAdapter[K]>()` is not assignable to the generic `CustomAdapter`
 * methods. This resolves them the same way so those mocks can stand in.
 */
type AdapterOverrides = {
	[K in keyof CustomAdapter]?: CustomAdapter[K] extends (
		...args: infer A
	) => infer R
		? (...args: A) => R
		: CustomAdapter[K];
};

async function createTestAdapter<Options extends BetterAuthOptions>(
	props: {
		config?: Partial<AdapterFactoryConfig>;
		options?: Options;
		adapter?: (
			...args: Parameters<AdapterFactoryCustomizeAdapterCreator>
		) => AdapterOverrides;
	} = {
		config: {
			adapterId: "test-id",
			adapterName: "Test Adapter",
			usePlural: false,
			debugLogs: false,
			supportsJSON: true,
			supportsDates: true,
			supportsBooleans: true,
		},
		options: {} as never,
		adapter: () => ({}),
	},
) {
	const {
		config = {
			adapterId: "test-id",
			adapterName: "Test Adapter",
			usePlural: false,
			debugLogs: false,
			supportsJSON: true,
			supportsDates: true,
			supportsBooleans: true,
		},
		options = {},
		adapter = () => ({}),
	} = props;
	const testAdapter = createAdapterFactory({
		config: Object.assign(
			{
				adapterId: "test-id",
				adapterName: "Test Adapter",
				usePlural: false,
				debugLogs: false,
				supportsJSON: true,
				supportsDates: true,
				supportsBooleans: true,
			},
			config,
		),
		adapter: (...args) => {
			const x = adapter(...args) as Partial<
				ReturnType<AdapterFactoryCustomizeAdapterCreator>
			>;
			return {
				async create(data) {
					return x.create?.(data) ?? data.data;
				},
				async update(data) {
					return x.update?.(data) ?? data.update;
				},
				async updateMany(data) {
					return x.updateMany?.(data) ?? 0;
				},
				async count(data) {
					return x.count?.(data) ?? 0;
				},
				async delete(data) {
					return x.delete?.(data);
				},
				async deleteMany(data) {
					return x.deleteMany?.(data) ?? 0;
				},
				async consumeOne(data) {
					return x.consumeOne?.(data) ?? null;
				},
				async incrementOne(data) {
					return x.incrementOne?.(data) ?? null;
				},
				async findMany(data) {
					return x.findMany?.(data) ?? [];
				},
				async findOne(data) {
					return x.findOne?.(data) ?? null;
				},
				options: x.options ?? {},
			};
		},
	});
	const auth = betterAuth({
		...options,
		database: testAdapter,
	});

	return (await auth.$context).adapter as DBAdapter<Options>;
}

describe("Create Adapter Helper", async () => {
	const adapterId = "test-adapter-id";
	const adapter = await createTestAdapter({
		config: {
			adapterId,
		},
	});

	test("Should have the correct adapter id", () => {
		expect(adapter.id).toBe(adapterId);
	});

	test("Should use the id generator if passed into the betterAuth config", async () => {
		const adapter = await createTestAdapter({
			config: {
				debugLogs: {},
			},
			options: {
				advanced: {
					database: {
						generateId(options) {
							return "HARD-CODED-ID";
						},
					},
				},
			},
		});
		const res = await adapter.create({
			model: "user",
			data: { name: "test-name" },
		});
		expect(res).toHaveProperty("id");
		expect(res.id).toBe("HARD-CODED-ID");
	});

	test("Should not generate an id if `advanced.database.generateId` is not defined or false", async () => {
		const adapter = await createTestAdapter({
			config: {},
			options: {
				advanced: {
					database: { generateId: false },
				},
			},
			adapter(args_0) {
				return {
					async create(data) {
						expect(data.data.id).not.toBeDefined();
						return data.data;
					},
				};
			},
		});

		const testResult = await adapter.create({
			model: "user",
			data: { name: "test-name" },
		});
		expect(testResult.id).not.toBeDefined();
	});

	test("Should generate UUIDs when `advanced.database.generateId` is set to 'uuid'", async () => {
		const adapter = await createTestAdapter({
			config: {},
			options: {
				advanced: {
					database: {
						generateId: "uuid",
					},
				},
			},
		});

		// UUID regex pattern: 8-4-4-4-12 hexadecimal digits
		const uuidRegex =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

		// Test single UUID generation
		const res = await adapter.create({
			model: "user",
			data: { name: "test-name" },
		});
		expect(res).toHaveProperty("id");
		expect(typeof res.id).toBe("string");
		expect(res.id).toMatch(uuidRegex);

		const ids = new Set<string>();
		for (let i = 0; i < 10; i++) {
			const result = await adapter.create({
				model: "user",
				data: { name: `test-name-${i}` },
			});
			expect(result.id).toMatch(uuidRegex);
			expect(ids.has(result.id)).toBe(false);
			ids.add(result.id);
		}
		expect(ids.size).toBe(10);
	});

	test("Should preserve a forced UUID when the adapter supports native UUIDs", async () => {
		const existingId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
		const adapter = await createTestAdapter({
			config: {
				supportsUUIDs: true,
			},
			options: {
				advanced: {
					database: {
						generateId: "uuid",
					},
				},
			},
			adapter() {
				return {
					async create(data) {
						expect(data.data.id).toBe(existingId);
						return data.data;
					},
				};
			},
		});

		const result = await adapter.create({
			model: "user",
			data: {
				id: existingId,
				name: "test-name",
			},
			forceAllowId: true,
		});

		expect(result.id).toBe(existingId);
	});

	describe("Checking for the results of an adapter call, as well as the parameters passed into the adapter call", () => {
		describe("create", () => {
			test("Should fill in the missing fields in the result", async () => {
				const res = await adapter.create({
					model: "user",
					data: { name: "test-name" },
				});
				expect(res).toHaveProperty("id");
				expect(res).toHaveProperty("name");
				expect(res).toHaveProperty("email");
				expect(res).toHaveProperty("emailVerified");
				expect(res).toHaveProperty("image");
				expect(res).toHaveProperty("createdAt");
				expect(res).toHaveProperty("updatedAt");
				expect(res?.emailVerified).toEqual(false);
				expect(res?.name).toEqual("test-name");
				expect(res?.email).toEqual(undefined);
				expect(res?.image).toEqual(undefined);
				expect(res?.createdAt).toBeInstanceOf(Date);
				expect(res?.updatedAt).toBeInstanceOf(Date);
			});

			test("should not return string for nullable foreign keys", async () => {
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
					},
					options: {
						plugins: [
							{
								id: "test",
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
							},
						],
					},
				});
				const res = await adapter.create({
					model: "testModel",
					data: { nullableReference: null },
				});
				expect(res).toHaveProperty("nullableReference");
				expect(res.nullableReference).toBeNull();

				const adapter2 = await createTestAdapter({
					config: {
						debugLogs: {},
					},
					options: {
						plugins: [
							{
								id: "test",
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
							},
						],
						advanced: {
							database: {
								generateId: "serial",
							},
						},
					},
				});
				const res2 = await adapter2.create({
					model: "testModel",
					data: { nullableReference: null },
				});
				expect(res2).toHaveProperty("nullableReference");
				expect(res2.nullableReference).toBeNull();
			});

			test('Should include an "id" in the result in all cases, unless "select" is used to exclude it', async () => {
				const res = await adapter.create({
					model: "user",
					data: { name: "test-name" },
				});
				expect(res).toHaveProperty("id");
				expect(typeof res?.id).toEqual("string");

				const adapterWithoutIdGeneration = await createTestAdapter({
					config: {
						disableIdGeneration: true,
						debugLogs: {},
					},
				});
				const res2 = await adapterWithoutIdGeneration.create({
					model: "user",
					data: { name: "test-name" },
				});
				// Id will still be present, due to the transformOutput function. However it will be undefined, vvvvv
				expect(res2).toHaveProperty("id");
				expect(typeof res2?.id).toEqual("undefined");
				// In a real case, the `id` should always be present

				const res3 = await adapter.create({
					model: "user",
					data: { name: "test-name" },
					select: ["name"],
				});
				expect(res3).toHaveProperty("name");
				expect(res3).not.toHaveProperty("id");
			});

			test('Should receive a generated id during the call, unless "disableIdGeneration" is set to true', async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					adapter: () => ({ create }),
				});
				await adapter.create({ model: "user", data: { name: "test-name" } });
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data.id).toBeTypeOf("string");

				const createWithoutId = vi.fn<CustomAdapter["create"]>();
				const adapterWithoutId = await createTestAdapter({
					config: { disableIdGeneration: true, debugLogs: {} },
					adapter: () => ({ create: createWithoutId }),
				});
				await adapterWithoutId.create({
					model: "user",
					data: { name: "test-name" },
				});
				const argsWithoutId = createWithoutId.mock.lastCall?.[0];
				expect.assert(argsWithoutId);
				expect(argsWithoutId.data).not.toHaveProperty("id");
			});

			test("Should not modify result null to string for id or fields referencing id", async () => {
				const adapter = await createTestAdapter({
					options: {
						plugins: [
							{
								id: "test-plugin-id",
								schema: {
									testPluginTable: {
										fields: {
											testPluginField: {
												type: "string",
												required: false,
												references: {
													model: "user",
													field: "id",
												},
											},
										},
									},
								},
							},
						],
					},
				});
				const result = await adapter.create({
					model: "testPluginTable",
					data: { testPluginField: null },
				});

				expect(result).toMatchObject({
					id: expect.any(String),
					testPluginField: null,
				});
			});

			test("Should modify boolean type to 1 or 0 if the DB doesn't support it. And expect the result to be transformed back to boolean", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						supportsBooleans: false,
					},
					adapter: () => ({ create }),
				});

				// Testing true
				const trueResult = await adapter.create({
					model: "user",
					data: { emailVerified: true },
				});
				expect(trueResult).toHaveProperty("emailVerified");
				expect(trueResult.emailVerified).toBe(true);

				// Testing false
				const falseResult = await adapter.create({
					model: "user",
					data: { emailVerified: false },
				});
				expect(falseResult).toHaveProperty("emailVerified");
				expect(falseResult.emailVerified).toBe(false);
				expect(create.mock.calls.map(([args]) => args.data)).toMatchObject([
					{ emailVerified: 1 },
					{ emailVerified: 0 },
				]);
			});

			test("Should modify string[] type to TEXT if the DB doesn't support it. And expect the result to be transformed back to string[]", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						supportsJSON: false,
					},
					options: {
						user: {
							additionalFields: {
								preferences: {
									type: "string[]",
								},
							},
						},
					},
					adapter: () => ({ create }),
				});
				const obj = { preferences: ["medium", "large"] };
				const res = await adapter.create({
					model: "user",
					data: obj,
				});
				expect(res).toHaveProperty("preferences");
				expect(res.preferences).toEqual(obj.preferences);
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					preferences: '[\"medium\",\"large\"]',
				});
			});

			test("Should modify number[] type to TEXT if the DB doesn't support it. And expect the result to be transformed back to number[]", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						supportsJSON: false,
					},
					options: {
						user: {
							additionalFields: {
								preferences: {
									type: "number[]",
								},
							},
						},
					},
					adapter: () => ({ create }),
				});
				const obj = { preferences: [6, 7] };
				const res = await adapter.create({
					model: "user",
					data: obj,
				});
				expect(res).toHaveProperty("preferences");
				expect(res.preferences).toEqual(obj.preferences);
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					preferences: "[6,7]",
				});
			});

			test("Should modify JSON type to TEXT if the DB doesn't support it. And expect the result to be transformed back to JSON", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						supportsJSON: false,
					},
					options: {
						user: {
							additionalFields: {
								preferences: {
									type: "json",
								},
							},
						},
					},
					adapter: () => ({ create }),
				});
				const obj = { preferences: { color: "blue", size: "large" } };
				const res = await adapter.create({
					model: "user",
					data: obj,
				});
				expect(res).toHaveProperty("preferences");
				expect(res.preferences).toEqual(obj.preferences);
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					preferences: '{"color":"blue","size":"large"}',
				});
			});

			test("Should modify date type to TEXT if the DB doesn't support it. And expect the result to be transformed back to date", async () => {
				const testDate = new Date();
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						supportsDates: false,
					},
					adapter: () => ({ create }),
				});
				const res = await adapter.create({
					model: "user",
					data: { createdAt: testDate },
				});
				expect(res).toHaveProperty("createdAt");
				expect(res.createdAt).toBeInstanceOf(Date);
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					createdAt: testDate.toISOString(),
				});
			});

			test("Should allow custom transform input", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						customTransformInput({ field, data }) {
							if (field === "name") {
								return data.toUpperCase();
							}
							return data;
						},
					},
					adapter: () => ({ create }),
				});
				const res = await adapter.create({
					model: "user",
					data: { name: "test-name" },
				});
				expect(res).toHaveProperty("name");
				expect(res.name).toEqual("TEST-NAME");
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					name: "TEST-NAME",
				});
			});

			test("Should allow custom transform output", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						customTransformOutput({ field, data }) {
							if (field === "name") {
								return data.toLowerCase();
							}
							return data;
						},
					},
					adapter: () => ({ create }),
				});
				const res = await adapter.create({
					model: "user",
					data: { name: "TEST-NAME" },
				});
				expect(res).toHaveProperty("name");
				expect(res.name).toEqual("test-name");
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				// Remains the same as the input because we're only transforming the output
				expect(args.data).toMatchObject({
					name: "TEST-NAME",
				});
			});

			test("Should allow custom transform input and output", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						customTransformInput({ field, data }) {
							if (field === "name") {
								return data.toUpperCase();
							}
							return data;
						},
						customTransformOutput({ field, data }) {
							if (field === "name") {
								return data.toLowerCase();
							}
							return data;
						},
					},
					adapter: () => ({ create }),
				});
				const res = await adapter.create({
					model: "user",
					data: { name: "TEST-NAME" },
				});
				expect(res).toHaveProperty("name");
				expect(res.name).toEqual("test-name");
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					name: "TEST-NAME",
				});
			});

			test("Should allow custom map input key transformation", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						mapKeysTransformInput: {
							email: "email_address",
						},
					},
					adapter: () => ({ create }),
				});

				const res = (await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				})) as { email: string };

				expect(res).toHaveProperty("email");
				expect(res).not.toHaveProperty("email_address");
				expect(res.email).toEqual(undefined); // The reason it's undefined is because we did transform `email` to `email_address`, however we never transformed `email_address` back to `email`.
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					email_address: "test@test.com",
				});
			});

			test("Should allow custom transform input to transform the where clause", async () => {
				const findOne = vi.fn<CustomAdapter["findOne"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						mapKeysTransformInput: {
							id: "_id",
						},
					},
					adapter: () => ({ findOne }),
				});
				await adapter.findOne({
					model: "user",
					where: [{ field: "id", value: "123" }],
				});

				const args = findOne.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.where).toMatchObject([{ field: "_id" }]);
			});

			test("Should allow custom map output key transformation", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						mapKeysTransformOutput: {
							email: "wrong_email_key",
						},
					},

					adapter: () => ({ create }),
				});
				const res = (await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				})) as { wrong_email_key: string };
				// Even though we're using the output key transformation, we still don't actually get the key transformation we want.
				// This is because the output is also parsed against the schema, and the `wrong_email_key` key is not in the schema.
				expect(res).toHaveProperty("wrong_email_key");
				expect(res).not.toHaveProperty("email");
				expect(res.wrong_email_key).toEqual("test@test.com");

				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					email: "test@test.com",
				});
			});

			test("Should allow custom map input and output key transformation", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						mapKeysTransformInput: {
							email: "email_address",
						},
						mapKeysTransformOutput: {
							email_address: "email",
						},
					},
					adapter: () => ({ create }),
				});
				const res = await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				});
				expect(res).toHaveProperty("email");
				expect(res).not.toHaveProperty("email_address");
				expect(res.email).toEqual("test@test.com");
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					email_address: "test@test.com",
				});
				expect(args.data).not.toHaveProperty("email");
			});

			test("Should expect the fields to be transformed into the correct field names if customized", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
					},
					options: {
						user: {
							fields: {
								email: "email_address",
							},
						},
					},
					adapter: () => ({ create }),
				});
				const res = await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				});
				expect(res).toHaveProperty("email");
				expect(res).not.toHaveProperty("email_address");
				expect(res.email).toEqual("test@test.com");
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					email_address: "test@test.com",
				});
				expect(args.data).not.toHaveProperty("email");
			});

			test("Should expect the model to be transformed into the correct model name if customized", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
					},
					options: {
						user: {
							modelName: "user_table",
						},
					},
					adapter: () => ({ create }),
				});
				const res = await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				});
				expect(res).toHaveProperty("id");
				expect(res).toHaveProperty("email");
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.model).toEqual("user_table");
			});

			test("Should expect the result to follow the schema", async () => {
				const create = vi.fn<CustomAdapter["create"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
					},
					options: {
						user: {
							fields: {
								email: "email_address",
							},
						},
					},
					adapter: () => ({ create }),
				});
				const res = await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				});
				expect(res).toHaveProperty("email");
				expect(res).toHaveProperty("id");
				expect(res).toHaveProperty("createdAt");
				expect(res).toHaveProperty("updatedAt");
				expect(res).toHaveProperty("name");
				expect(res).toHaveProperty("emailVerified");
				expect(res).toHaveProperty("image");
				expect(res).not.toHaveProperty("email_address");
				const args = create.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.data).toMatchObject({
					email_address: "test@test.com",
				});
				expect(args.data).not.toHaveProperty("email");
			});

			test("Should expect the result to respect the select fields", async () => {
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
					},
					options: {
						user: {
							fields: {
								email: "email_address",
							},
						},
					},
				});
				const res = await adapter.create({
					model: "user",
					data: {
						email: "test@test.com",
						name: "test-name",
						emailVerified: false,
						image: "test-image",
					},
					select: ["email"],
				});
				expect(res).toHaveProperty("email");
				expect(res).not.toHaveProperty("name");
				expect(res).not.toHaveProperty("emailVerified");
				expect(res).not.toHaveProperty("image");
				expect(res).toMatchSnapshot();
			});
		});

		describe("update", () => {
			test("Should fill in the missing fields in the result", async () => {
				const user: { id: string; name: string } = await adapter.create({
					model: "user",
					data: { name: "test-name" },
				});
				const res = await adapter.update({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { name: "test-name-2" },
				});
				expect(res).toHaveProperty("id");
				expect(res).toHaveProperty("name");
				expect(res).toHaveProperty("email");
				expect(res).toHaveProperty("emailVerified");
				expect(res).toHaveProperty("image");
				expect(res).toHaveProperty("createdAt");
				expect(res).toHaveProperty("updatedAt");
			});

			test(`Should include an "id" in the result in all cases`, async () => {
				const user: { id: string; name: string } = await adapter.create({
					model: "user",
					data: { name: "test-name" },
				});
				const res: { id: string } | null = await adapter.update({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { name: "test-name-2" },
				});
				expect(res).toHaveProperty("id");
			});

			test("Should modify boolean type to 1 or 0 if the DB doesn't support it. And expect the result to be transformed back to boolean", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						supportsBooleans: false,
					},
					adapter: () => ({ update }),
				});
				const user: { emailVerified: boolean; id: string } =
					await adapter.create({
						model: "user",
						data: { emailVerified: false },
					});

				// Testing true
				const trueResult = await adapter.update({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { emailVerified: true },
				});
				expect(trueResult).toHaveProperty("emailVerified");
				//@ts-expect-error
				expect(trueResult.emailVerified).toBe(true);

				// Testing false
				const falseResult = await adapter.update({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { emailVerified: false },
				});
				expect(falseResult).toHaveProperty("emailVerified");
				//@ts-expect-error
				expect(falseResult.emailVerified).toBe(false);
				expect(update.mock.calls.map(([args]) => args.update)).toMatchObject([
					{ emailVerified: 1 },
					{ emailVerified: 0 },
				]);
			});

			test("Should modify JSON type to TEXT if the DB doesn't support it. And expect the result to be transformed back to JSON", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						supportsJSON: false,
					},
					options: {
						user: {
							additionalFields: {
								preferences: {
									type: "json",
								},
							},
						},
					},
					adapter: () => ({ update }),
				});
				const obj = { preferences: { color: "blue", size: "large" } };
				const user: { email: string; id: string } = await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				});
				const res: typeof obj | null = await adapter.update({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { preferences: obj.preferences },
				});
				expect(res).toHaveProperty("preferences");
				expect(res?.preferences).toEqual(obj.preferences);
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).toMatchObject({
					preferences: '{"color":"blue","size":"large"}',
				});
			});

			test("Should modify date type to TEXT if the DB doesn't support it. And expect the result to be transformed back to date", async () => {
				const testDate = new Date();
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						supportsDates: false,
					},
					adapter: () => ({ update }),
				});
				const user: { email: string; id: string } = await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				});
				const res: { createdAt: Date } | null = await adapter.update({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { createdAt: testDate },
				});
				expect(res).toHaveProperty("createdAt");
				expect(res?.createdAt).toBeInstanceOf(Date);
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).toMatchObject({
					createdAt: testDate.toISOString(),
				});
			});

			test("Should allow custom transform input", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						customTransformInput({ field, data }) {
							if (field === "name") {
								return data.toUpperCase();
							}
							return data;
						},
					},
					adapter: () => ({ update }),
				});
				const user: { id: string; name: string } = await adapter.create({
					model: "user",
					data: { name: "test-name" },
				});
				const res = await adapter.update({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { name: "test-name-2" },
				});

				expect(res).toMatchObject({ name: "TEST-NAME-2" });
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).toMatchObject({
					name: "TEST-NAME-2",
				});
			});

			test("Should allow custom transform output", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						customTransformOutput({ field, data }) {
							if (field === "name") {
								return data.toLowerCase();
							}
							return data;
						},
					},
					adapter: () => ({ update }),
				});
				const user: { id: string; name: string } = await adapter.create({
					model: "user",
					data: { name: "TEST-NAME" },
				});
				const res: { name: string } | null = await adapter.update({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { name: "test-name-2" },
				});
				expect(res).toHaveProperty("name");
				expect(res?.name).toEqual("test-name-2");
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).toMatchObject({
					name: "test-name-2",
				});
			});

			test("Should allow custom transform input and output", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						customTransformInput({ field, data }) {
							if (field === "name") {
								return data.toUpperCase();
							}
							return data;
						},
						customTransformOutput({ field, data }) {
							if (field === "name") {
								return data.toLowerCase();
							}
							return data;
						},
					},
					adapter: () => ({ update }),
				});
				const user: { id: string; name: string } = await adapter.create({
					model: "user",
					data: { name: "test-name" },
				});
				const res: { name: string } | null = await adapter.update({
					model: "user",
					where: [{ field: "id", value: user.id }],
					update: { name: "test-name-2" },
				});
				expect(res).toHaveProperty("name");
				expect(res?.name).toEqual("test-name-2");
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).toMatchObject({
					name: "test-name-2".toUpperCase(),
				});
			});

			test("Should allow custom map input key transformation", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						mapKeysTransformInput: {
							email: "email_address",
						},
					},
					adapter: () => ({ update }),
				});
				const user = (await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				})) as { email: string; id: string };

				const res: { email: string } | null = await adapter.update({
					model: "user",
					update: { email: "test2@test.com" },
					where: [{ field: "id", value: user.id }],
				});

				expect(res).toHaveProperty("email");
				expect(res).not.toHaveProperty("email_address");
				expect(res?.email).toEqual(undefined); // The reason it's undefined is because we did transform `email` to `email_address`, however we never transformed `email_address` back to `email`.
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).toMatchObject({
					email_address: "test2@test.com",
				});
			});

			test("Should allow custom map output key transformation", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						mapKeysTransformOutput: {
							email: "email_address",
						},
					},
					adapter: () => ({ update }),
				});
				const user = (await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				})) as { email: string; id: string };

				const res: { email_address: string } | null = await adapter.update({
					model: "user",
					update: { email: "test2@test.com" },
					where: [{ field: "id", value: user.id }],
				});

				expect(res).toHaveProperty("email_address");
				expect(res).not.toHaveProperty("email");
				expect(res?.email_address).toEqual("test2@test.com");
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).toMatchObject({
					email: "test2@test.com",
				});
				expect(args.update).not.toHaveProperty("email_address");
			});

			test("Should allow custom map input and output key transformation", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
						mapKeysTransformInput: {
							email: "email_address",
						},
						mapKeysTransformOutput: {
							email_address: "email",
						},
					},
					adapter: () => ({ update }),
				});
				const user = (await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				})) as { email: string; id: string };

				const res: { email: string } | null = await adapter.update({
					model: "user",
					update: { email: "test2@test.com" },
					where: [{ field: "id", value: user.id }],
				});

				expect(res).toHaveProperty("email");
				expect(res).not.toHaveProperty("email_address");
				expect(res?.email).toEqual("test2@test.com");
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).toMatchObject({
					email_address: "test2@test.com",
				});
				expect(args.update).not.toHaveProperty("email");
			});

			test("Should expect the fields to be transformed into the correct field names if customized", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						debugLogs: {},
					},
					options: {
						user: {
							fields: {
								email: "email_address",
							},
						},
					},
					adapter: () => ({ update }),
				});
				const user: { id: string; email: string } = await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				});
				const res: { email: string } | null = await adapter.update({
					model: "user",
					update: { email: "test2@test.com" },
					where: [{ field: "id", value: user.id }],
				});
				expect(res).toHaveProperty("email");
				expect(res).not.toHaveProperty("email_address");
				expect(res?.email).toEqual("test2@test.com");
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).toMatchObject({
					email_address: "test2@test.com",
				});
				expect(args.update).not.toHaveProperty("email");
			});

			test("Should expect not to receive an id even if disableIdGeneration is false in an update call", async () => {
				const update = vi.fn<CustomAdapter["update"]>();
				const adapter = await createTestAdapter({
					config: {
						disableIdGeneration: true,
					},
					adapter: () => ({ update }),
				});
				const user: { email: string; id: string } = await adapter.create({
					model: "user",
					data: { email: "test@test.com" },
				});
				await adapter.update({
					model: "user",
					update: { email: "test2@test.com" },
					where: [{ field: "id", value: user.id }],
				});
				const args = update.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.update).not.toHaveProperty("id");
			});
		});

		describe("find", () => {
			test("findOne: Should transform the where clause according to the schema", async () => {
				const fakeResult: Omit<User, "email"> & {
					email_address: string;
				} = {
					/* cspell:disable-next-line */
					id: "random-id-oudwduwbdouwbdu123b",
					email_address: "test@test.com",
					emailVerified: false,
					createdAt: new Date(),
					updatedAt: new Date(),
					name: "test-name",
				};
				const findOne = vi
					.fn<CustomAdapter["findOne"]>()
					.mockResolvedValue(fakeResult);
				const adapter = await createTestAdapter({
					options: {
						user: {
							fields: {
								email: "email_address",
							},
						},
					},
					adapter: () => ({ findOne }),
				});
				const res = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "email", value: "test@test.com" }],
				});
				expect(res).not.toHaveProperty("email_address");
				expect(res).toHaveProperty("email");
				expect(res?.email).toEqual("test@test.com");
				const args = findOne.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.where).toMatchObject([{ field: "email_address" }]);
			});
			test("findMany: Should transform the where clause according to the schema", async () => {
				const fakeResult: (Omit<User, "email"> & {
					email_address: string;
				})[] = [
					{
						id: "random-id-eio1d1u12h33123ed",
						email_address: "test@test.com",
						emailVerified: false,
						createdAt: new Date(),
						updatedAt: new Date(),
						name: "test-name",
					},
				];
				const findMany = vi
					.fn<CustomAdapter["findMany"]>()
					.mockResolvedValue(fakeResult);
				const adapter = await createTestAdapter({
					options: {
						user: {
							fields: {
								email: "email_address",
							},
						},
					},
					adapter: () => ({ findMany }),
				});
				const res = await adapter.findMany<User>({
					model: "user",
					where: [{ field: "email", value: "test@test.com" }],
				});
				expect(res[0]).not.toHaveProperty("email_address");
				expect(res[0]).toHaveProperty("email");
				expect(res[0]?.email).toEqual("test@test.com");
				const args = findMany.mock.lastCall?.[0];
				expect.assert(args);
				expect(args.where).toMatchObject([{ field: "email_address" }]);
			});

			test("findOne: Should receive an integer id in where clause if the user has enabled `serial`", async () => {
				const fakeResult: Omit<User, "id"> & { id: number } = {
					id: 1,
					email: "test@test.com",
					emailVerified: false,
					createdAt: new Date(),
					updatedAt: new Date(),
					name: "test-name",
				};
				const findOne = vi
					.fn<CustomAdapter["findOne"]>()
					.mockResolvedValue(fakeResult);
				const adapter = await createTestAdapter({
					options: {
						advanced: {
							database: {
								generateId: "serial",
							},
						},
					},
					adapter: () => ({ findOne }),
				});
				const res = await adapter.findOne<User>({
					model: "user",
					where: [{ field: "id", value: "1" }],
				});

				expect(res).toHaveProperty("id");
				expect(res?.id).toEqual("1");
				const args = findOne.mock.lastCall?.[0];
				expect.assert(args);
				// The where clause should convert the string id value of `"1"` to an int since `generateId` is serial.
				expect(args.where).toMatchObject([{ value: 1 }]);
			});
			test("findMany: Should receive an integer id in where clause if the user has enabled `serial`", async () => {
				const fakeResult: (Omit<User, "id"> & { id: number })[] = [
					{
						id: 1,
						email: "test@test.com",
						emailVerified: false,
						createdAt: new Date(),
						updatedAt: new Date(),
						name: "test-name",
					},
				];
				const findMany = vi
					.fn<CustomAdapter["findMany"]>()
					.mockResolvedValue(fakeResult);
				const adapter = await createTestAdapter({
					options: {
						advanced: {
							database: {
								generateId: "serial",
							},
						},
					},
					adapter: () => ({ findMany }),
				});
				const res = await adapter.findMany<User>({
					model: "user",
					where: [{ field: "id", value: "1" }],
				});

				expect(res[0]).toHaveProperty("id");
				expect(res[0]!.id).toEqual("1");
				const args = findMany.mock.lastCall?.[0];
				expect.assert(args);
				// The where clause should convert the string id value of `"1"` to an int since `serial` is enabled.
				expect(args.where).toMatchObject([{ value: 1 }]);
			});
		});
	});
});

describe("Fallback JoinOption System", async () => {
	describe("fallback when adapter returns flat rows (no join keys)", () => {
		test("findOne: Should handle forward joins (joined model has FK to base model) by making separate queries", async () => {
			let adapterCalls: Array<{ method: string; model: string }> = [];

			const adapter = await createTestAdapter({
				config: {
					debugLogs: {},
				},
				options: {
					advanced: {
						database: {
							joins: true,
						},
					},
				},
				adapter: () =>
					({
						async findOne({ model, where, join }: any) {
							adapterCalls.push({ method: "findOne", model });

							if (model === "user") {
								return {
									id: "user-123",
									email: "test@test.com",
									emailVerified: false,
									createdAt: new Date(),
									updatedAt: new Date(),
									name: "Test User",
								};
							}
							return null;
						},
						async findMany({ model, where }: any) {
							adapterCalls.push({ method: "findMany", model });

							if (model === "session") {
								return [
									{
										id: "session-1",
										userId: "user-123",
										expiresAt: new Date(),
										createdAt: new Date(),
									},
								];
							}
							return [];
						},
					}) as any,
			});

			adapterCalls = [];
			const res = await adapter.findOne({
				model: "user",
				where: [{ field: "id", value: "user-123" }],
				join: { session: true },
			});

			// Should make two separate queries: one for user, one for sessions
			expect(adapterCalls.length).toBeGreaterThanOrEqual(2);
			expect(adapterCalls.some((c) => c.model === "user")).toBe(true);
			expect(adapterCalls.some((c) => c.model === "session")).toBe(true);
			expect(res).toHaveProperty("id");
			// Adapter-factory's fallback join system should have added session data
			expect(res).toHaveProperty("session");
		});

		test("findMany: Should handle forward joins efficiently using IN operator", async () => {
			let adapterCalls: Array<{ method: string; model: string; where?: any }> =
				[];

			const adapter = await createTestAdapter({
				config: {
					debugLogs: {},
				},
				options: {
					advanced: {
						database: {
							joins: true,
						},
					},
				},
				adapter: () =>
					({
						async findMany({ model, where }: any) {
							adapterCalls.push({ method: "findMany", model, where });

							if (model === "user") {
								return [
									{
										id: "user-1",
										email: "test1@test.com",
										emailVerified: false,
										createdAt: new Date(),
										updatedAt: new Date(),
										name: "User 1",
									},
									{
										id: "user-2",
										email: "test2@test.com",
										emailVerified: false,
										createdAt: new Date(),
										updatedAt: new Date(),
										name: "User 2",
									},
								];
							}

							if (model === "session") {
								// Should receive an IN query with user IDs
								return [
									{
										id: "session-1",
										userId: "user-1",
										expiresAt: new Date(),
										createdAt: new Date(),
									},
									{
										id: "session-2",
										userId: "user-2",
										expiresAt: new Date(),
										createdAt: new Date(),
									},
								];
							}
							return [];
						},
					}) as any,
			});

			adapterCalls = [];
			const res = await adapter.findMany({
				model: "user",
				where: [],
				join: { session: true },
			});

			// Should use IN operator for joined data query, not individual queries
			const sessionCall = adapterCalls.find((c) => c.model === "session");
			expect(sessionCall).toBeDefined();
			expect(sessionCall?.where).toBeDefined();

			// Result should have session data attached by fallback join system
			expect(res).toBeInstanceOf(Array);
			expect(res.length).toBeGreaterThan(0);
			res.forEach((item) => {
				expect(item).toHaveProperty("session");
			});
		});
	});

	describe("native join support (advanced.database.joins: true)", () => {
		test("findOne: Should pass join to adapter and use nested data when present", async () => {
			let joinPassedToAdapter = null;

			const adapter = await createTestAdapter({
				config: {
					debugLogs: {},
				},
				options: {
					advanced: {
						database: {
							joins: true,
						},
					},
				},
				adapter: () =>
					({
						async findOne({ model, join }: any) {
							joinPassedToAdapter = join;
							return {
								id: "user-123",
								email: "test@test.com",
								emailVerified: false,
								createdAt: new Date(),
								updatedAt: new Date(),
								name: "Test User",
								session: [
									{
										id: "session-1",
										userId: "user-123",
										expiresAt: new Date(),
										createdAt: new Date(),
									},
								],
							};
						},
					}) as any,
			});

			const res = await adapter.findOne({
				model: "user",
				where: [{ field: "id", value: "user-123" }],
				join: { session: true },
			});

			expect(joinPassedToAdapter).not.toBeUndefined();
			expect(joinPassedToAdapter).toHaveProperty("session");
			expect(res).toHaveProperty("session");
		});

		test("findMany: Should pass join to adapter and use nested data when present", async () => {
			let joinPassedToAdapter = null;

			const adapter = await createTestAdapter({
				config: {
					debugLogs: {},
				},
				options: {
					advanced: {
						database: {
							joins: true,
						},
					},
				},
				adapter: () =>
					({
						async findMany({ model, join }: any) {
							joinPassedToAdapter = join;
							return [
								{
									id: "user-123",
									email: "test@test.com",
									emailVerified: false,
									createdAt: new Date(),
									updatedAt: new Date(),
									name: "Test User",
									session: [
										{
											id: "session-1",
											userId: "user-123",
											expiresAt: new Date(),
											createdAt: new Date(),
										},
									],
								},
							];
						},
					}) as any,
			});

			const res = await adapter.findMany({
				model: "user",
				where: [],
				join: { session: true },
			});

			expect(joinPassedToAdapter).not.toBeUndefined();
			expect(joinPassedToAdapter).toHaveProperty("session");
			expect(res).toBeInstanceOf(Array);
			expect(res[0]).toHaveProperty("session");
		});
	});

	describe("default behavior (joins disabled)", () => {
		test("Should not pass join to adapter by default", async () => {
			let joinPassedToAdapter = null;

			const adapter = await createTestAdapter({
				config: {
					debugLogs: {},
				},
				adapter: () =>
					({
						async findOne({ model, join }: any) {
							joinPassedToAdapter = join;
							return {
								id: "user-123",
								email: "test@test.com",
								emailVerified: false,
								createdAt: new Date(),
								updatedAt: new Date(),
								name: "Test User",
							};
						},
						async findMany({ model }: any) {
							if (model === "session") {
								return [];
							}
							return [];
						},
					}) as any,
			});

			await adapter.findOne({
				model: "user",
				where: [{ field: "id", value: "user-123" }],
				join: { session: true },
			});

			expect(joinPassedToAdapter).toBeUndefined();
		});
	});
});
