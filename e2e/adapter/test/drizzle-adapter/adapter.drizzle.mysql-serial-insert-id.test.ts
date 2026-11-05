import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { SQL } from "drizzle-orm";
import { int, MySqlDialect, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { describe, expect, it, test } from "vitest";

const INSERT_ID = 42;
const STALE_POOL_INSERT_ID = 7;
const insertedRow = { id: INSERT_ID, label: "widget-a" };
const rows = [{ id: STALE_POOL_INSERT_ID, label: "widget-a" }, insertedRow];

const dialect = new MySqlDialect();

// The pooled connection has a different last insert id. A non-unique field
// lookup can also match an existing row with the same label.
const makeSelect = (storedRows: typeof rows) => (projection?: unknown) => {
	const state: { projection: unknown; value: unknown; limit: number } = {
		projection,
		value: undefined,
		limit: 2,
	};
	const chain = {
		from() {
			return this;
		},
		where(condition: SQL) {
			[state.value] = dialect.sqlToQuery(condition).params;
			return this;
		},
		limit(limit: number) {
			state.limit = limit;
			return this;
		},
		execute: async () => {
			if (state.projection) return [{ id: STALE_POOL_INSERT_ID }];
			return storedRows
				.filter((row) =>
					typeof state.value === "number"
						? row.id === state.value
						: row.label === state.value,
				)
				.slice(0, state.limit);
		},
	};
	return chain;
};

const makeDb = (insertIds: { id?: number }[], storedRows: typeof rows) => {
	const tx = { select: makeSelect(storedRows) };
	return {
		_: {},
		insert: () => ({
			values: (values: Record<string, unknown>) => ({
				config: {
					values: [values],
				},
				$returningId: () => ({
					execute: async () => insertIds,
				}),
				execute: async () => [{ insertId: INSERT_ID }],
			}),
		}),
		transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
		select: makeSelect(storedRows),
	};
};

const widgetTable = mysqlTable("widget", {
	id: int("id").primaryKey().autoincrement(),
	label: varchar("label", { length: 191 }).notNull(),
});

/**
 * When a MySQL insert returns its generated id, use it to resolve the row.
 * LAST_INSERT_ID() is connection-scoped and cannot identify that row when a
 * subsequent query uses another pooled connection.
 *
 * @see https://dev.mysql.com/doc/refman/8.4/en/information-functions.html#function_last-insert-id
 */
describe("drizzle adapter: MySQL serial insert id", () => {
	const createAdapter = (insertIds: { id?: number }[], storedRows = rows) =>
		drizzleAdapter(makeDb(insertIds, storedRows), {
			schema: {
				widget: widgetTable,
			},
			provider: "mysql",
		})({
			advanced: {
				database: {
					generateId: "serial",
				},
			},
			plugins: [
				{
					id: "test-widget",
					schema: {
						widget: {
							fields: {
								label: {
									type: "string",
									required: true,
								},
							},
						},
					},
				},
			],
		});

	it("returns the row identified by the insert result", async () => {
		const created = await createAdapter([{ id: INSERT_ID }]).create({
			model: "widget",
			data: {
				label: "widget-a",
			},
		});

		expect(created).toEqual({
			label: "widget-a",
			id: String(INSERT_ID),
		});
	});

	test.for([{ insertIds: [] }, { insertIds: [{}] }])(
		"falls back to an unambiguous row when the insert result $insertIds has no id",
		async ({ insertIds }) => {
			const created = await createAdapter(insertIds, [insertedRow]).create({
				model: "widget",
				data: { label: "widget-a" },
			});
			expect(created).toEqual({ id: String(INSERT_ID), label: "widget-a" });
		},
	);

	test.for([{ insertIds: [] }, { insertIds: [{}] }])(
		"does not choose between matching rows when the insert result $insertIds has no id",
		async ({ insertIds }) => {
			await expect(
				createAdapter(insertIds).create({
					model: "widget",
					data: {
						label: "widget-a",
					},
				}),
			).resolves.toBeNull();
		},
	);
});
