import { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "@better-auth/core";
import { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kyselyAdapter } from "./kysely-adapter";
import { NodeSqliteDialect } from "./node-sqlite-dialect";

interface CountersTable {
	id: string;
	name: string;
	remaining: number;
	used: number;
	status: string;
}

interface TestDatabase {
	counters: CountersTable;
}

// Register `counters` as a known model through a plugin schema so the factory
// recognizes the table, maps field names, and delegates to the native
// incrementOne against the real SQLite database.
const options: BetterAuthOptions = {
	plugins: [
		{
			id: "counters-test",
			schema: {
				counters: {
					fields: {
						name: { type: "string" },
						remaining: { type: "number" },
						used: { type: "number" },
						status: { type: "string" },
					},
				},
			},
		},
	],
};

let sqlite: DatabaseSync;
let db: Kysely<TestDatabase>;
let executedSql: string[];
let executedParameters: unknown[][];

function buildAdapter() {
	return kyselyAdapter(db as unknown as Kysely<any>, { type: "sqlite" })(
		options,
	);
}

beforeEach(() => {
	sqlite = new DatabaseSync(":memory:");
	sqlite
		.prepare(
			"CREATE TABLE counters (id TEXT PRIMARY KEY, name TEXT, remaining INTEGER, used INTEGER, status TEXT)",
		)
		.run();
	executedSql = [];
	executedParameters = [];
	db = new Kysely<TestDatabase>({
		dialect: new NodeSqliteDialect({ database: sqlite }),
		log(event) {
			if (event.level === "query") {
				executedSql.push(event.query.sql);
				executedParameters.push([...event.query.parameters]);
			}
		},
	});
});

afterEach(async () => {
	await db.destroy();
});

describe("kysely incrementOne native", () => {
	it("applies deltas atomically and returns the updated row", async () => {
		await db
			.insertInto("counters")
			.values({
				id: "a",
				name: "alpha",
				remaining: 3,
				used: 0,
				status: "open",
			})
			.execute();
		const adapter = buildAdapter();

		const result = await adapter.incrementOne<CountersTable>({
			model: "counters",
			where: [{ field: "name", value: "alpha" }],
			increment: { remaining: -1, used: 1 },
		});

		expect(result?.remaining).toBe(2);
		expect(result?.used).toBe(1);

		// The native path issues a single self-referential UPDATE
		// (`set field = field + delta`) with RETURNING, not the fallback's
		// SELECT-then-UPDATE pair.
		const updates = executedSql.filter((sql) => sql.startsWith("update"));
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatch(/"remaining"\s*=\s*"remaining"\s*\+/i);
		expect(updates[0]).toMatch(/returning/i);
		expect(executedSql.some((sql) => sql.startsWith("select"))).toBe(false);

		const row = await db
			.selectFrom("counters")
			.selectAll()
			.where("name", "=", "alpha")
			.executeTakeFirst();
		expect(row?.remaining).toBe(2);
		expect(row?.used).toBe(1);
	});

	it("applies absolute `set` assignments alongside increments", async () => {
		await db
			.insertInto("counters")
			.values({
				id: "b",
				name: "beta",
				remaining: 5,
				used: 2,
				status: "open",
			})
			.execute();
		const adapter = buildAdapter();

		const result = await adapter.incrementOne<CountersTable>({
			model: "counters",
			where: [{ field: "name", value: "beta" }],
			increment: { remaining: -1 },
			set: { status: "closed" },
		});

		expect(result?.remaining).toBe(4);
		expect(result?.status).toBe("closed");
	});

	it("mutates exactly one row when the guard matches multiple", async () => {
		await db
			.insertInto("counters")
			.values([
				{
					id: "d1",
					name: "shared",
					remaining: 5,
					used: 0,
					status: "open",
				},
				{
					id: "d2",
					name: "shared",
					remaining: 5,
					used: 0,
					status: "open",
				},
				{
					id: "d3",
					name: "shared",
					remaining: 5,
					used: 0,
					status: "open",
				},
			])
			.execute();
		const adapter = buildAdapter();

		// The guard (`remaining > 0`) matches all three rows, but the single-row
		// contract requires that at most one row is mutated and returned.
		const result = await adapter.incrementOne<CountersTable>({
			model: "counters",
			where: [
				{ field: "name", value: "shared" },
				{ field: "remaining", value: 0, operator: "gt" },
			],
			increment: { remaining: -1, used: 1 },
		});

		expect(result?.remaining).toBe(4);
		expect(result?.used).toBe(1);

		const rows = await db
			.selectFrom("counters")
			.selectAll()
			.where("name", "=", "shared")
			.orderBy("id")
			.execute();
		const mutated = rows.filter((r) => r.remaining === 4 && r.used === 1);
		const untouched = rows.filter((r) => r.remaining === 5 && r.used === 0);
		expect(mutated).toHaveLength(1);
		expect(untouched).toHaveLength(2);
		// The returned row is the one that was actually mutated.
		expect(mutated[0]?.id).toBe(result?.id);
	});

	it("returns null when the guard matches no row and leaves data untouched", async () => {
		await db
			.insertInto("counters")
			.values({
				id: "c",
				name: "gamma",
				remaining: 0,
				used: 4,
				status: "open",
			})
			.execute();
		const adapter = buildAdapter();

		// The guard requires `remaining > 0`; with remaining already at 0 the
		// update must match nothing rather than driving the counter negative.
		const result = await adapter.incrementOne<CountersTable>({
			model: "counters",
			where: [
				{ field: "name", value: "gamma" },
				{ field: "remaining", value: 0, operator: "gt" },
			],
			increment: { remaining: -1 },
		});

		expect(result).toBeNull();

		const row = await db
			.selectFrom("counters")
			.selectAll()
			.where("name", "=", "gamma")
			.executeTakeFirst();
		expect(row?.remaining).toBe(0);
		expect(row?.used).toBe(4);
	});
});

describe("kysely incrementMany native", () => {
	it("updates matching rows in one statement and omits guard misses", async () => {
		await db
			.insertInto("counters")
			.values([
				{
					id: "c",
					name: "carol",
					remaining: 3,
					used: 0,
					status: "open",
				},
				{
					id: "a",
					name: "alice",
					remaining: 3,
					used: 0,
					status: "open",
				},
				{
					id: "b",
					name: "bob",
					remaining: 0,
					used: 0,
					status: "open",
				},
			])
			.execute();
		const adapter = buildAdapter();

		const result = await adapter.incrementMany<CountersTable>({
			model: "counters",
			increment: { remaining: -1, used: 1 },
			rows: [
				{
					where: [
						{ field: "id", value: "c" },
						{ field: "remaining", value: 0, operator: "gt" },
					],
				},
				{
					where: [
						{ field: "id", value: "b" },
						{ field: "remaining", value: 0, operator: "gt" },
					],
				},
				{
					where: [
						{ field: "id", value: "a" },
						{ field: "remaining", value: 0, operator: "gt" },
					],
				},
			],
		});

		expect(new Set(result.map((row) => row.id))).toEqual(new Set(["a", "c"]));
		expect(result.every((row) => row.remaining === 2 && row.used === 1)).toBe(
			true,
		);
		const updates = executedSql.filter((sql) => sql.startsWith("update"));
		expect(updates).toHaveLength(1);
		expect(updates[0]).toMatch(/returning/i);
		const bob = await db
			.selectFrom("counters")
			.selectAll()
			.where("id", "=", "b")
			.executeTakeFirst();
		expect(bob?.remaining).toBe(0);
	});

	it("keeps each sqlite update at or below 999 bound parameters", async () => {
		const values = Array.from({ length: 500 }, (_, index) => ({
			id: `id-${index.toString().padStart(3, "0")}`,
			name: `row-${index}`,
			remaining: 3,
			used: 0,
			status: "open",
		}));
		await db.insertInto("counters").values(values).execute();
		const adapter = buildAdapter();

		const result = await adapter.incrementMany<CountersTable>({
			model: "counters",
			increment: { remaining: -1, used: 1 },
			rows: values.map((row) => ({
				where: [
					{ field: "id", value: row.id },
					{ field: "remaining", value: 0, operator: "gt" },
				],
			})),
		});

		expect(result).toHaveLength(500);
		expect(result.every((row) => row.remaining === 2 && row.used === 1)).toBe(
			true,
		);
		const updates = executedSql.flatMap((sql, index) =>
			sql.startsWith("update")
				? [{ sql, parameters: executedParameters[index] ?? [] }]
				: [],
		);
		expect(updates.length).toBeGreaterThan(1);
		for (const update of updates) {
			expect(update.parameters.length).toBeLessThanOrEqual(999);
		}
	});
});
