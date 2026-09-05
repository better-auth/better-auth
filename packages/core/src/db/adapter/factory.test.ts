import { describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "../../types";
import { createAdapterFactory } from "./factory";
import type { CleanedWhere, CustomAdapter, Where } from "./index";

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

	it("falls back to findOne plus id-guarded deleteMany when consumeOne is missing", async () => {
		const deleteCalls: CleanedWhere[][] = [];
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				consumeOne: undefined,
				findOne: async <T>() =>
					({ id: "verification-id", identifier_text: "stored-token" }) as T,
				deleteMany: async ({ where }) => {
					deleteCalls.push(where);
					return 1;
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
		expect(deleteCalls[0]).toEqual([
			{
				field: "identifier_text",
				value: "token:consumeOne",
				operator: "eq",
				connector: "AND",
				mode: "sensitive",
			},
			{
				field: "id",
				value: "verification-id",
				operator: "eq",
				connector: "AND",
				mode: "sensitive",
			},
		]);
	});

	it("returns null from the consumeOne fallback when another caller deleted the row first", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				consumeOne: undefined,
				findOne: async <T>() => ({ id: "verification-id" }) as T,
				deleteMany: async () => 0,
			}),
		});

		await expect(
			adapter.consumeOne({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
			}),
		).resolves.toBeNull();
	});

	it("falls back to a compare-and-swap updateMany when incrementOne is missing", async () => {
		const updateCalls: {
			where: CleanedWhere[];
			update: Record<string, any>;
		}[] = [];
		let attemptCount = 2;
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				incrementOne: undefined,
				findOne: async <T>() =>
					({ id: "verification-id", attempt_count: attemptCount }) as T,
				updateMany: async ({ where, update }) => {
					updateCalls.push({ where, update });
					attemptCount = update.attempt_count;
					return 1;
				},
			}),
		});

		const result = await adapter.incrementOne<{ id: string; attempts: number }>(
			{
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
				increment: { attempts: 1 },
			},
		);

		expect(result).toEqual({ id: "verification-id", attempts: 3 });
		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0]!.update).toEqual({ attempt_count: 3 });
		expect(updateCalls[0]!.where).toEqual([
			{
				field: "identifier_text",
				value: "token:incrementOne",
				operator: "eq",
				connector: "AND",
				mode: "sensitive",
			},
			{
				field: "id",
				value: "verification-id",
				operator: "eq",
				connector: "AND",
				mode: "sensitive",
			},
			{
				field: "attempt_count",
				value: 2,
				operator: "eq",
				connector: "AND",
				mode: "sensitive",
			},
		]);
	});

	it("retries the incrementOne fallback after losing a compare-and-swap race", async () => {
		let stored = 2;
		let updateCalls = 0;
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				incrementOne: undefined,
				findOne: async <T>() =>
					({ id: "verification-id", attempt_count: stored }) as T,
				updateMany: async ({ update }) => {
					updateCalls++;
					if (updateCalls === 1) {
						// A concurrent writer bumped the counter between read and write.
						stored = 3;
						return 0;
					}
					stored = update.attempt_count;
					return 1;
				},
			}),
		});

		const result = await adapter.incrementOne<{ attempts: number }>({
			model: "verification",
			where: [{ field: "identifier", value: "token" }],
			increment: { attempts: 1 },
		});

		expect(updateCalls).toBe(2);
		expect(result?.attempts).toBe(4);
	});

	it("returns null from the incrementOne fallback when the guard matches no row", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				incrementOne: undefined,
				findOne: async () => null,
			}),
		});

		await expect(
			adapter.incrementOne({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
				increment: { attempts: 1 },
			}),
		).resolves.toBeNull();
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

/**
 * HTTP query params arrive as strings. Coercion must happen in the adapter
 * factory before the underlying store sees the where clause — SQL engines
 * often cast silently, which can hide missing coercion in integration tests.
 */
describe("createAdapterFactory where value coercion", () => {
	it("coerces string where values to match field types before querying", async () => {
		const seenWhere: CleanedWhere[][] = [];
		const adapter = createAdapterFactory({
			config: {
				adapterId: "test-adapter",
				adapterName: "Test Adapter",
				supportsBooleans: true,
			},
			adapter: () =>
				createCustomAdapter({
					findMany: async <T>(
						params: Parameters<CustomAdapter["findMany"]>[0],
					) => {
						if (params.where) {
							seenWhere.push(params.where);
						}
						return [] as T[];
					},
				}),
		})({
			user: {
				additionalFields: {
					age: { type: "number", required: false },
				},
			},
		});

		await adapter.findMany({
			model: "user",
			where: [{ field: "emailVerified", operator: "eq", value: "false" }],
		});
		await adapter.findMany({
			model: "user",
			where: [{ field: "age", operator: "eq", value: "25" }],
		});
		await adapter.findMany({
			model: "user",
			where: [{ field: "age", operator: "in", value: ["25", "30"] }],
		});

		expect(seenWhere).toEqual([
			[
				{
					field: "emailVerified",
					value: false,
					operator: "eq",
					connector: "AND",
					mode: "sensitive",
				},
			],
			[
				{
					field: "age",
					value: 25,
					operator: "eq",
					connector: "AND",
					mode: "sensitive",
				},
			],
			[
				{
					field: "age",
					value: [25, 30],
					operator: "in",
					connector: "AND",
					mode: "sensitive",
				},
			],
		]);
	});
});
