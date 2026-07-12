import { describe, expect, it } from "vitest";
import { runWithTransaction } from "../../context/transaction";
import type { BetterAuthOptions } from "../../types";
import { createAdapterFactory } from "./factory";
import type {
	CleanedWhere,
	CustomAdapter,
	DBAdapter,
	DBTransactionAdapter,
} from "./index";

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
	transaction,
}: {
	adapter: CustomAdapter;
	options?: BetterAuthOptions;
	transaction?: <R>(
		callback: (trx: DBTransactionAdapter<BetterAuthOptions>) => Promise<R>,
	) => Promise<R>;
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
			transaction,
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9869
	 */
	it("reuses the active transaction for the fallback", async () => {
		let transactionCalls = 0;
		let isTransactionActive = false;
		let adapter: DBAdapter<BetterAuthOptions> | null = null;

		const transaction = async <R>(
			callback: (trx: DBTransactionAdapter<BetterAuthOptions>) => Promise<R>,
		): Promise<R> => {
			transactionCalls += 1;
			if (isTransactionActive) {
				throw new Error("nested transaction");
			}
			if (!adapter) {
				throw new Error("adapter has not been initialized");
			}
			isTransactionActive = true;
			try {
				return await callback(adapter);
			} finally {
				isTransactionActive = false;
			}
		};

		adapter = createTestAdapter({
			transaction,
			adapter: createCustomAdapter({
				findMany: async <T>() =>
					[
						{
							id: "verification-id",
							identifier_text: "stored-token",
						},
					] as T[],
				deleteMany: async () => 1,
			}),
		});

		const result = await runWithTransaction(adapter, async () =>
			adapter!.consumeOne<{ id: string; identifier: string }>({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
			}),
		);

		expect(result?.id).toBe("verification-id");
		expect(transactionCalls).toBe(1);
	});

	it("throws when deleteMany returns a non-numeric value", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				findMany: async <T>() =>
					[
						{
							id: "verification-id",
							identifier_text: "stored-token",
						},
					] as T[],
				// A misbehaving adapter (e.g. a document store returning the raw
				// delete response) breaks the count-based race gate. The fallback
				// must surface this instead of reporting a spurious miss.
				deleteMany: async () => ({ deleted: true }) as unknown as number,
			}),
		});

		await expect(
			adapter.consumeOne({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
			}),
		).rejects.toThrowError(/non-numeric value from deleteMany/);
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
