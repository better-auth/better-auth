import { describe, expect, it } from "vitest";
import type { BetterAuthOptions } from "../../types";
import { createAdapterFactory } from "./factory";
import type { CleanedWhere, CustomAdapter, Where } from "./index";

type Row = Record<string, any>;

/**
 * A minimal in-memory adapter backed by a plain `Record<string, Row[]>` store.
 * It deliberately does NOT implement `incrementOne`, so the factory's
 * transaction-based fallback runs. It DOES provide a `transaction`
 * implementation (operations run against the same single-process store), which
 * matches the "no real isolation" scenario the compare-and-swap guard is built
 * for.
 */
function createMemoryAdapter(initial: Record<string, Row[]> = {}) {
	const store: Record<string, Row[]> = {};
	for (const [model, rows] of Object.entries(initial)) {
		store[model] = rows.map((row) => ({ ...row }));
	}

	const getTable = (model: string): Row[] => {
		if (!store[model]) store[model] = [];
		return store[model];
	};

	const matches = (row: Row, where: CleanedWhere[] | undefined): boolean => {
		if (!where || where.length === 0) return true;
		return where.every((clause) => {
			const value = row[clause.field];
			switch (clause.operator) {
				case "gt":
					return typeof value === "number" && value > (clause.value as number);
				case "gte":
					return typeof value === "number" && value >= (clause.value as number);
				case "lt":
					return typeof value === "number" && value < (clause.value as number);
				case "lte":
					return typeof value === "number" && value <= (clause.value as number);
				case "ne":
					return value !== clause.value;
				default:
					return value === clause.value;
			}
		});
	};

	let idCounter = 0;

	const adapter: CustomAdapter = {
		create: async <T extends Row>({
			model,
			data,
		}: {
			model: string;
			data: T;
		}) => {
			const row: Row = { ...data };
			if (row.id === undefined || row.id === null) {
				idCounter += 1;
				row.id = `row-${idCounter}`;
			}
			getTable(model).push(row);
			return row as T;
		},
		update: async <T>({
			model,
			where,
			update,
		}: {
			model: string;
			where: CleanedWhere[];
			update: T;
		}) => {
			const table = getTable(model);
			const row = table.find((r) => matches(r, where));
			if (!row) return null as T | null;
			Object.assign(row, update as Row);
			return row as T;
		},
		updateMany: async ({
			model,
			where,
			update,
		}: {
			model: string;
			where: CleanedWhere[];
			update: Row;
		}) => {
			const table = getTable(model);
			let count = 0;
			for (const row of table) {
				if (matches(row, where)) {
					Object.assign(row, update);
					count += 1;
				}
			}
			return count;
		},
		findOne: async <T>({
			model,
			where,
		}: {
			model: string;
			where: CleanedWhere[];
		}) => {
			const row = getTable(model).find((r) => matches(r, where));
			return (row ? { ...row } : null) as T | null;
		},
		findMany: async <T>({
			model,
			where,
			limit,
		}: {
			model: string;
			where?: CleanedWhere[] | undefined;
			limit: number;
		}) => {
			const rows = getTable(model)
				.filter((r) => matches(r, where))
				.slice(0, limit)
				.map((r) => ({ ...r }));
			return rows as T[];
		},
		delete: async ({
			model,
			where,
		}: {
			model: string;
			where: CleanedWhere[];
		}) => {
			const table = getTable(model);
			const index = table.findIndex((r) => matches(r, where));
			if (index !== -1) table.splice(index, 1);
		},
		deleteMany: async ({
			model,
			where,
		}: {
			model: string;
			where: CleanedWhere[];
		}) => {
			const table = getTable(model);
			let count = 0;
			for (let i = table.length - 1; i >= 0; i--) {
				const row = table[i];
				if (row && matches(row, where)) {
					table.splice(i, 1);
					count += 1;
				}
			}
			return count;
		},
		count: async ({
			model,
			where,
		}: {
			model: string;
			where?: CleanedWhere[] | undefined;
		}) => getTable(model).filter((r) => matches(r, where)).length,
	};

	return { adapter, store };
}

// The `rateLimit` table is the simplest always-numeric core model: `key`
// (string selector) and `count` (number) plus `lastRequest` (number). Enabling
// database storage registers it in the resolved schema.
const counterModel = "rateLimit";
const options: BetterAuthOptions = {
	rateLimit: { storage: "database" },
};

function createTestAdapter(adapter: CustomAdapter) {
	return createAdapterFactory<BetterAuthOptions>({
		config: {
			adapterId: "memory-test-adapter",
			adapterName: "Memory Test Adapter",
			usePlural: false,
			transaction: (callback) => callback(adapter as any),
		},
		adapter: () => adapter,
	})(options);
}

const seed = (rows: Row[]): Record<string, Row[]> => ({ [counterModel]: rows });

const firstRow = (store: Record<string, Row[]>): Row => {
	const row = store[counterModel]?.[0];
	if (!row) throw new Error(`expected at least one ${counterModel} row`);
	return row;
};

describe("createAdapterFactory incrementOne fallback", () => {
	it("applies a positive delta and returns the updated row", async () => {
		const { adapter } = createMemoryAdapter(seed([{ key: "a", count: 0 }]));
		const factory = createTestAdapter(adapter);

		const result = await factory.incrementOne<{ key: string; count: number }>({
			model: counterModel,
			where: [{ field: "key", value: "a" }],
			increment: { count: 1 },
		});

		expect(result?.count).toBe(1);
	});

	it("applies a negative delta to decrement", async () => {
		const { adapter } = createMemoryAdapter(seed([{ key: "a", count: 5 }]));
		const factory = createTestAdapter(adapter);

		const result = await factory.incrementOne<{ key: string; count: number }>({
			model: counterModel,
			where: [{ field: "key", value: "a" }],
			increment: { count: -2 },
		});

		expect(result?.count).toBe(3);
	});

	it("assigns absolute values via `set` in the same call", async () => {
		const { adapter, store } = createMemoryAdapter(
			seed([{ key: "a", count: 0, lastRequest: 100 }]),
		);
		const factory = createTestAdapter(adapter);

		const result = await factory.incrementOne<{
			key: string;
			count: number;
			lastRequest: number;
		}>({
			model: counterModel,
			where: [{ field: "key", value: "a" }],
			increment: { count: 1 },
			set: { lastRequest: 999 },
		});

		expect(result?.count).toBe(1);
		expect(result?.lastRequest).toBe(999);
		expect(firstRow(store).lastRequest).toBe(999);
	});

	it("returns null and does not mutate when the guard matches no row", async () => {
		const { adapter, store } = createMemoryAdapter(
			seed([{ key: "a", count: 0 }]),
		);
		const factory = createTestAdapter(adapter);

		const result = await factory.incrementOne({
			model: counterModel,
			where: [{ field: "count", operator: "gt", value: 0 }],
			increment: { count: -1 },
		});

		expect(result).toBeNull();
		expect(firstRow(store).count).toBe(0);
	});

	it("yields a single winner under contention and never goes negative", async () => {
		const { adapter, store } = createMemoryAdapter(
			seed([{ key: "a", count: 1 }]),
		);
		const factory = createTestAdapter(adapter);

		const claim = () =>
			factory.incrementOne<{ key: string; count: number }>({
				model: counterModel,
				where: [{ field: "count", operator: "gt", value: 0 }],
				increment: { count: -1 },
			});

		const results = await Promise.all([claim(), claim()]);
		const winners = results.filter((r) => r !== null);

		expect(winners).toHaveLength(1);
		expect(firstRow(store).count).toBe(0);
	});
});

describe("createAdapterFactory incrementOne native path", () => {
	it("delegates to a native incrementOne when implemented", async () => {
		const { adapter } = createMemoryAdapter(seed([{ key: "a", count: 10 }]));
		let nativeCalls = 0;
		const nativeAdapter: CustomAdapter = {
			...adapter,
			incrementOne: async <T>({
				model,
				where,
				increment,
				set,
			}: {
				model: string;
				where: CleanedWhere[];
				increment: Record<string, number>;
				set?: Record<string, unknown> | undefined;
			}) => {
				nativeCalls += 1;
				const rows = await adapter.findMany<Row>({ model, where, limit: 1 });
				const target = rows[0];
				if (!target) return null as T | null;
				const next: Row = { ...(set ?? {}) };
				for (const [field, delta] of Object.entries(increment)) {
					const current = typeof target[field] === "number" ? target[field] : 0;
					next[field] = current + delta;
				}
				const idWhere: CleanedWhere[] = [
					{
						field: "id",
						value: target.id,
						operator: "eq",
						connector: "AND",
						mode: "sensitive",
					},
				];
				await adapter.updateMany({ model, where: idWhere, update: next });
				return { ...target, ...next } as T;
			},
		};

		const factory = createTestAdapter(nativeAdapter);

		const result = await factory.incrementOne<{ key: string; count: number }>({
			model: counterModel,
			where: [{ field: "key", value: "a" }] satisfies Where[],
			increment: { count: 5 },
		});

		expect(nativeCalls).toBe(1);
		expect(result?.count).toBe(15);
	});
});
