import { describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "../../types";
import { getAuthTables } from "../get-tables";
import type { BetterAuthDBSchema } from "../type";
import { createAdapterFactory } from "./factory";
import type { CustomAdapter, Where } from "./index";

function createCustomAdapter(
	overrides: Partial<CustomAdapter> = {},
): CustomAdapter {
	return {
		create: async ({ data }) => data,
		update: async () => null,
		updateMany: async () => 0,
		findOne: async () => null,
		findMany: async () => [],
		delete: async () => {},
		deleteMany: async () => 0,
		consumeOne: async () => null,
		incrementOne: async () => null,
		count: async () => 0,
		...overrides,
	};
}

function createTestAdapter({
	adapter,
	options = {},
}: {
	adapter: CustomAdapter;
	options?: BetterAuthOptions;
}) {
	return createAdapterFactory<BetterAuthOptions>({
		config: {
			adapterId: "test-adapter",
			adapterName: "Test Adapter",
			usePlural: true,
			customTransformInput({ action, data, field }) {
				if (field === "identifier_text" && typeof data === "string") {
					return `${data}:${action}`;
				}
				return data;
			},
			customTransformOutput({ data, field }) {
				if (field === "identifier" && typeof data === "string") {
					return `${data}:output`;
				}
				return data;
			},
		},
		adapter: () => adapter,
	})({
		...options,
		verification: {
			modelName: "verificationRecord",
			fields: {
				identifier: "identifier_text",
			},
			additionalFields: {
				attempts: {
					type: "number",
					required: false,
					fieldName: "attempt_count",
				},
			},
			...options.verification,
		},
	});
}

describe("createAdapterFactory atomic primitives", () => {
	it("delegates consumeOne to the native adapter with transformed where and output", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				consumeOne: async <T>({
					model,
					where,
				}: {
					model: string;
					where: Required<Where>[];
				}) => {
					expect(model).toBe("verificationRecords");
					expect(where).toEqual([
						{
							field: "identifier_text",
							value: "token:consumeOne",
							operator: "eq",
							connector: "AND",
							mode: "sensitive",
						},
					]);
					return {
						id: "verification-id",
						identifier_text: "stored-token",
					} as T;
				},
			}),
		});

		const result = await adapter.consumeOne<{ id: string; identifier: string }>(
			{
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
			},
		);

		expect(result).toEqual({
			id: "verification-id",
			identifier: "stored-token:output",
		});
	});

	it("delegates incrementOne to the native adapter with mapped increment fields", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				incrementOne: async <T>({
					model,
					where,
					increment,
					set,
				}: {
					model: string;
					where: Required<Where>[];
					increment: Record<string, number>;
					set?: Record<string, unknown> | undefined;
				}) => {
					expect(model).toBe("verificationRecords");
					expect(where).toEqual([
						{
							field: "identifier_text",
							value: "token:incrementOne",
							operator: "eq",
							connector: "AND",
							mode: "sensitive",
						},
					]);
					expect(increment).toEqual({ attempt_count: 1 });
					expect(set).toEqual({
						value: "next",
						updatedAt: expect.any(Date),
					});
					return {
						id: "verification-id",
						identifier_text: "stored-token",
						attempt_count: 2,
						value: "next",
					} as T;
				},
			}),
		});

		const result = await adapter.incrementOne<{
			id: string;
			identifier: string;
			attempts: number;
			value: string;
		}>({
			model: "verification",
			where: [{ field: "identifier", value: "token" }],
			increment: { attempts: 1 },
			set: { value: "next" },
		});

		expect(result).toEqual({
			id: "verification-id",
			identifier: "stored-token:output",
			attempts: 2,
			value: "next",
		});
	});

	it("throws before native incrementOne when every update field is transformed away", async () => {
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "test-adapter",
				adapterName: "Test Adapter",
				usePlural: true,
				customTransformInput({ action, data }) {
					if (action === "update") {
						return undefined;
					}
					return data;
				},
			},
			adapter: () =>
				createCustomAdapter({
					incrementOne: async () => {
						throw new Error("incrementOne should not be called");
					},
				}),
		})({
			verification: {
				modelName: "verificationRecord",
				additionalFields: {
					attempts: {
						type: "number",
						required: false,
						fieldName: "attempt_count",
					},
				},
			},
		});

		await expect(
			adapter.incrementOne({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
				increment: {},
				set: { attempts: 1 },
			}),
		).rejects.toThrow(/resolved to an empty update/);
	});

	it("throws a clear error when consumeOne is missing at runtime", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				consumeOne: undefined as unknown as CustomAdapter["consumeOne"],
			}),
		});

		await expect(
			adapter.consumeOne({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
			}),
		).rejects.toThrow(/must implement consumeOne/);
	});

	it("throws a clear error when incrementOne is missing at runtime", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				incrementOne: undefined as unknown as CustomAdapter["incrementOne"],
			}),
		});

		await expect(
			adapter.incrementOne({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
				increment: { attempts: 1 },
			}),
		).rejects.toThrow(/must implement incrementOne/);
	});

	it("throws a clear error when updateMany does not return a finite count", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				updateMany: async () => Number.NaN,
			}),
		});

		await expect(
			adapter.updateMany({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
				update: { value: "next" },
			}),
		).rejects.toThrow(/updateMany must return a finite number/);
	});
});

describe("createAdapterFactory auth-owned schema injection", () => {
	it("uses the injected tables instance for field resolution and authTables", async () => {
		const options: BetterAuthOptions = {
			account: {
				fields: {
					accountId: "provider_account_id",
				},
			},
		};
		const tables = getAuthTables(options);
		let observedSchema: BetterAuthDBSchema | undefined;

		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "schema-injection",
				adapterName: "Schema Injection Adapter",
			},
			adapter: ({ schema }) => {
				observedSchema = schema;
				return createCustomAdapter({
					findOne: (async ({ model, where }) => {
						expect(model).toBe("account");
						expect(where[0]?.field).toBe("provider_account_id");
						return {
							id: "acc-1",
							provider_account_id: "oauth-sub",
						};
					}) as CustomAdapter["findOne"],
				});
			},
		})(options, tables);

		expect(observedSchema).toBe(tables);
		expect(adapter.options?.authTables).toBe(tables);

		const result = await adapter.findOne<{
			id: string;
			accountId: string;
		}>({
			model: "account",
			where: [{ field: "accountId", value: "oauth-sub" }],
		});
		expect(result).toEqual({
			id: "acc-1",
			accountId: "oauth-sub",
		});
	});

	it("resolves plugin-contributed fields from the injected schema", async () => {
		const options: BetterAuthOptions = {
			plugins: [
				{
					id: "custom-plugin",
					schema: {
						user: {
							fields: {
								role: {
									type: "string",
									required: false,
									fieldName: "user_role",
								},
							},
						},
					},
				},
			],
		};
		const tables = getAuthTables(options);

		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "plugin-schema",
				adapterName: "Plugin Schema Adapter",
			},
			adapter: ({ getFieldName }) =>
				createCustomAdapter({
					create: async ({ data, model }) => {
						expect(model).toBe("user");
						expect(getFieldName({ model: "user", field: "role" })).toBe(
							"user_role",
						);
						expect(data).toMatchObject({
							user_role: "admin",
						});
						return { id: "u-1", ...data };
					},
				}),
		})(options, tables);

		const created = await adapter.create({
			model: "user",
			data: {
				name: "Ada",
				email: "ada@example.com",
				emailVerified: false,
				role: "admin",
			},
			forceAllowId: true,
		});
		expect(created).toMatchObject({
			role: "admin",
		});
		expect(created).toHaveProperty("id");
	});

	it("resolves custom user.fields mappings from the injected schema", async () => {
		const options: BetterAuthOptions = {
			user: {
				fields: {
					email: "email_address",
					name: "full_name",
				},
			},
		};
		const tables = getAuthTables(options);

		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "custom-fields",
				adapterName: "Custom Fields Adapter",
			},
			adapter: () =>
				createCustomAdapter({
					findMany: (async ({ model, where }) => {
						expect(model).toBe("user");
						expect(where?.[0]?.field).toBe("email_address");
						return [
							{
								id: "u-1",
								email_address: "ada@example.com",
								full_name: "Ada Lovelace",
							},
						];
					}) as CustomAdapter["findMany"],
				}),
		})(options, tables);

		const users = await adapter.findMany<{
			id: string;
			email: string;
			name: string;
		}>({
			model: "user",
			where: [{ field: "email", value: "ada@example.com" }],
		});
		expect(users).toEqual([
			{
				id: "u-1",
				email: "ada@example.com",
				name: "Ada Lovelace",
			},
		]);
	});

	/**
	 * Simulates an adapter package that rebuilt schema with a divergent core
	 * (providerAccountId/issuer) while the host still uses accountId.
	 * Injected host tables must win so OAuth account lookups keep working.
	 */
	it("keeps accountId resolution when injected schema differs from a divergent local rebuild", async () => {
		const options: BetterAuthOptions = {};
		const hostTables = getAuthTables(options);

		// Divergent "adapter-local" schema shape (historical providerAccountId era).
		// createAdapterFactory must NOT use this when host tables are injected.
		const divergentLocal: BetterAuthDBSchema = {
			...hostTables,
			account: {
				...hostTables.account!,
				fields: {
					providerAccountId: {
						type: "string",
						required: true,
						fieldName: "providerAccountId",
					},
					providerId: hostTables.account!.fields.providerId!,
					userId: hostTables.account!.fields.userId!,
					createdAt: hostTables.account!.fields.createdAt!,
					updatedAt: hostTables.account!.fields.updatedAt!,
				},
			},
		};
		expect(divergentLocal.account!.fields.accountId).toBeUndefined();
		expect(hostTables.account!.fields.accountId).toBeDefined();

		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "oauth-account-id",
				adapterName: "OAuth AccountId Adapter",
			},
			adapter: ({ schema, getFieldName }) => {
				expect(schema).toBe(hostTables);
				expect(schema).not.toBe(divergentLocal);
				expect(getFieldName({ model: "account", field: "accountId" })).toBe(
					"accountId",
				);
				return createCustomAdapter({
					findOne: (async ({ where }) => {
						expect(where[0]?.field).toBe("accountId");
						return {
							id: "acc-1",
							accountId: "provider-sub",
							providerId: "google",
							userId: "u-1",
						};
					}) as CustomAdapter["findOne"],
				});
			},
		})(options, hostTables);

		const account = await adapter.findOne({
			model: "account",
			where: [{ field: "accountId", value: "provider-sub" }],
		});
		expect(account).toMatchObject({
			accountId: "provider-sub",
			providerId: "google",
		});
	});

	it("falls back to getAuthTables when tables are omitted (compat)", () => {
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "compat",
				adapterName: "Compat Adapter",
			},
			adapter: () => createCustomAdapter(),
		})({});

		expect(
			adapter.options?.authTables?.account?.fields.accountId,
		).toBeDefined();
	});
});
