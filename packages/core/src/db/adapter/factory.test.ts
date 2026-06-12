import { describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "../../types";
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
