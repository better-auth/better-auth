/**
 * With `generateId: "serial"` on MySQL the adapter resolved the inserted row's
 * id via `LAST_INSERT_ID()`. That value is connection-scoped, but on a mysql2
 * pool the follow-up read runs in a transaction on a different connection than
 * the insert, so it read 0 and the created row could not be found. The id is now
 * taken from Drizzle's `$returningId()`, which performs the insert and returns
 * the generated id normalized across the MySQL-dialect drivers.
 *
 * The fake builder models that contract: `$returningId().execute()` yields the
 * normalized `[{ id }]`, while a plain `execute()` would only carry the raw
 * driver shape. The transaction connection sees `LAST_INSERT_ID()` as 0.
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
			values: (v: Record<string, any>) => {
				let returningId = false;
				const builder = {
					config: { values: [v] },
					$returningId() {
						returningId = true;
						return builder;
					},
					// `$returningId` normalizes the id to `[{ id }]`; a raw insert would
					// only expose the driver-specific shape.
					execute: async () =>
						returningId ? [{ id: INSERT_ID }] : [{ insertId: INSERT_ID }],
				};
				return builder;
			},
		}),
		transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
		select: makeSelect(),
	};
};

const widgetTable = {
	id: { name: "id" },
	label: { name: "label" },
};

describe("drizzle relations-v2 adapter: MySQL serial insert id", () => {
	it("resolves the inserted row from Drizzle's $returningId, not LAST_INSERT_ID()", async () => {
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

		// The row resolved at all only if the id came from `$returningId`. A
		// connection-scoped LAST_INSERT_ID() of 0 would have returned null here.
		expect(created?.label).toBe("widget-a");
		expect(Number(created?.id)).toBe(INSERT_ID);
	});
});
