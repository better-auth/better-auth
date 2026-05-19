import { describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "../../types";
import { createAdapterFactory } from "./factory";
import type { CleanedWhere, CustomAdapter } from "./index";

function createCustomAdapter(overrides: Partial<CustomAdapter>): CustomAdapter {
	return {
		create: async <T extends Record<string, any>>({ data }: { data: T }) =>
			data,
		update: async <T>() => null as T | null,
		updateMany: async () => 0,
		findOne: async <T>() => null as T | null,
		findMany: async <T>() => [] as T[],
		delete: async () => {},
		deleteMany: async () => 0,
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
			...options.verification,
		},
	});
}

describe("createAdapterFactory consumeOne fallback", () => {
	it("uses transaction adapter methods without double-transforming input or output", async () => {
		const findMany: CustomAdapter["findMany"] = async <T>(
			params: Parameters<CustomAdapter["findMany"]>[0],
		) => {
			const { model, where, limit } = params;
			expect(model).toBe("verificationRecords");
			expect(limit).toBe(1);
			expect(where).toEqual([
				{
					field: "identifier_text",
					value: "token:findMany",
					operator: "eq",
					connector: "AND",
					mode: "sensitive",
				},
			]);
			return [
				{
					id: "verification-id",
					identifier_text: "stored-token",
				},
			] as T[];
		};
		const deleteMany: CustomAdapter["deleteMany"] = async ({
			model,
			where,
		}) => {
			expect(model).toBe("verificationRecords");
			expect(where).toEqual([
				{
					field: "identifier_text",
					value: "token:deleteMany",
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
			] satisfies CleanedWhere[]);
			return 1;
		};

		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				findMany,
				deleteMany,
			}),
		});

		const result = await adapter.consumeOne<{ id: string; identifier: string }>(
			{
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
			},
		);

		expect(result?.id).toBe("verification-id");
		expect(result?.identifier).toBe("stored-token:output");
	});

	it("returns null when the delete loses the consume race", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				findMany: async <T>() =>
					[
						{
							id: "verification-id",
							identifier_text: "stored-token",
						},
					] as T[],
				deleteMany: async () => 0,
			}),
		});

		const result = await adapter.consumeOne({
			model: "verification",
			where: [{ field: "identifier", value: "token" }],
		});

		expect(result).toBeNull();
	});
});
