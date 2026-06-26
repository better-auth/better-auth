/**
 * With `generateId: "serial"` on MySQL the adapter resolved the inserted row's
 * id via `LAST_INSERT_ID()`. That value is connection-scoped, but on a mysql2
 * pool the follow-up read runs in a transaction on a different connection than
 * the insert, so it read 0 and the created row could not be found. The id is now
 * taken from the insert result's ResultSetHeader, which is connection-correct.
 *
 * The fake db models a pool: the insert reports `insertId` on its result while a
 * fresh transaction connection sees `LAST_INSERT_ID()` as 0.
 *
 * @see https://dev.mysql.com/doc/refman/8.4/en/information-functions.html#function_last-insert-id
 */
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { describe, expect, it } from "vitest";

const INSERT_ID = 42;
const storedRow = { id: INSERT_ID, label: "widget-a" };

// A select chain. When invoked with a projection argument it stands in for the
// `LAST_INSERT_ID()` read on a fresh pool connection (0). A plain select-all by
// id resolves the inserted row.
const makeSelect = () => (projection?: unknown) => {
	const state: { projection: unknown; limit: number | undefined } = {
		projection,
		limit: undefined,
	};
	const chain: Record<string, any> = {
		from: () => chain,
		where: () => chain,
		limit: (n: number) => {
			state.limit = n;
			return chain;
		},
		execute: async () => {
			if (state.projection) return [{ id: 0 }];
			return state.limit === 1 ? [storedRow] : [];
		},
	};
	return chain;
};

const makeDb = () => {
	const tx = { select: makeSelect() };
	return {
		_: {},
		insert: () => ({
			values: (v: Record<string, any>) => ({
				config: { values: [v] },
				// mysql2 reports the auto-increment id on the ResultSetHeader, which
				// drizzle returns as the first element of the raw result tuple.
				execute: async () => [{ insertId: INSERT_ID }],
			}),
		}),
		transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
		select: makeSelect(),
	};
};

const widgetTable = {
	id: { name: "id" },
	label: { name: "label" },
};

describe("drizzle relations-v2 adapter: MySQL serial insert id on a pool", () => {
	it("resolves the inserted row from the insert result, not LAST_INSERT_ID()", async () => {
		const adapter = drizzleAdapter(makeDb(), {
			schema: { widget: widgetTable },
			provider: "mysql",
		})({
			advanced: { database: { generateId: "serial" } },
			plugins: [
				{
					id: "test-widget",
					schema: {
						widget: {
							fields: {
								label: { type: "string", required: true },
							},
						},
					},
				},
			],
		});

		const created = await adapter.create<Record<string, any>>({
			model: "widget",
			data: { label: "widget-a" },
		});

		// The row resolved at all only if the id came from the insert result. A
		// connection-scoped LAST_INSERT_ID() of 0 would have returned null here.
		expect(created?.label).toBe("widget-a");
		expect(Number(created?.id)).toBe(INSERT_ID);
	});
});
