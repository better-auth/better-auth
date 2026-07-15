import { describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "../../types";
import { createAdapterFactory } from "./factory";
import type {
	AtomicWriteOperation,
	AtomicWriteResult,
	CleanedWhere,
	CustomAdapter,
	Where,
} from "./index";

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
	it("pluralizes identity model names without leaking storage grammar", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				findOne: async ({ model }) => {
					expect(model).toBe("identities");
					return null;
				},
			}),
		});

		await adapter.findOne({
			model: "identity",
			where: [{ field: "id", value: "identity-id" }],
		});
	});

	it("transforms and delegates every declarative atomic write exactly once", async () => {
		let storedOperations: readonly AtomicWriteOperation<CleanedWhere>[] = [];
		const storedResults: AtomicWriteResult[] = [
			{
				type: "create",
				record: {
					id: "verification-id",
					identifier_text: "created-token",
				},
			},
			{
				type: "update",
				record: {
					id: "verification-id",
					identifier_text: "updated-token",
					attempt_count: 2,
				},
			},
			{ type: "delete", deletedCount: 1 },
			{ type: "deleteMany", deletedCount: 3 },
		];
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				commitAtomicWrites: async (operations) => {
					storedOperations = operations;
					return storedResults;
				},
			}),
		});
		const operations: AtomicWriteOperation[] = [
			{
				type: "create",
				model: "verification",
				data: {
					id: "verification-id",
					identifier: "create-token",
					value: "pending",
				},
				forceAllowId: true,
			},
			{
				type: "update",
				model: "verification",
				where: [{ field: "identifier", value: "current-token" }],
				update: { identifier: "next-token", attempts: 2 },
			},
			{
				type: "delete",
				model: "verification",
				where: [{ field: "identifier", value: "delete-token" }],
			},
			{
				type: "deleteMany",
				model: "verification",
				where: [{ field: "identifier", value: "delete-many-token" }],
			},
		];

		const logicalResults = await adapter.commitAtomicWrites!(operations);

		expect(storedOperations).toEqual([
			{
				type: "create",
				model: "verificationRecords",
				data: expect.objectContaining({
					id: "verification-id",
					identifier_text: "create-token:create",
					value: "pending",
				}),
			},
			{
				type: "update",
				model: "verificationRecords",
				where: [
					{
						field: "identifier_text",
						value: "current-token:update",
						operator: "eq",
						connector: "AND",
						mode: "sensitive",
					},
				],
				update: expect.objectContaining({
					identifier_text: "next-token:update",
					attempt_count: 2,
				}),
			},
			{
				type: "delete",
				model: "verificationRecords",
				where: [
					{
						field: "identifier_text",
						value: "delete-token:delete",
						operator: "eq",
						connector: "AND",
						mode: "sensitive",
					},
				],
			},
			{
				type: "deleteMany",
				model: "verificationRecords",
				where: [
					{
						field: "identifier_text",
						value: "delete-many-token:deleteMany",
						operator: "eq",
						connector: "AND",
						mode: "sensitive",
					},
				],
			},
		]);
		expect(logicalResults).toEqual([
			{
				type: "create",
				record: expect.objectContaining({
					id: "verification-id",
					identifier: "created-token:output",
				}),
			},
			{
				type: "update",
				record: expect.objectContaining({
					id: "verification-id",
					identifier: "updated-token:output",
					attempts: 2,
				}),
			},
			{ type: "delete", deletedCount: 1 },
			{ type: "deleteMany", deletedCount: 3 },
		]);
	});

	it("does not expose atomic writes when the custom adapter lacks the capability", () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter(),
		});

		expect(adapter.commitAtomicWrites).toBeUndefined();
	});

	it("preserves a null result when an atomic update matches no row", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				commitAtomicWrites: async () => [{ type: "update", record: null }],
			}),
		});

		await expect(
			adapter.commitAtomicWrites!([
				{
					type: "update",
					model: "verification",
					where: [{ field: "identifier", value: "missing" }],
					update: { value: "next" },
				},
			]),
		).resolves.toEqual([{ type: "update", record: null }]);
	});

	it("rejects atomic results that are not aligned with their operations", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				commitAtomicWrites: async () => [{ type: "delete", deletedCount: 1 }],
			}),
		});

		await expect(
			adapter.commitAtomicWrites!([
				{
					type: "create",
					model: "verification",
					data: { identifier: "token", value: "pending" },
				},
			]),
		).rejects.toThrow(/returned a delete result for create operation 0/);
	});

	it("rejects an inexact result for an atomic single-row delete", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				commitAtomicWrites: async () => [
					{
						type: "delete",
						deletedCount: 2,
					} as unknown as AtomicWriteResult,
				],
			}),
		});

		await expect(
			adapter.commitAtomicWrites!([
				{
					type: "delete",
					model: "verification",
					where: [{ field: "identifier", value: "token" }],
				},
			]),
		).rejects.toThrow(/deletedCount of 0 or 1/);
	});

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
