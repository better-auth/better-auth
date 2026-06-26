/**
 * Regression test for affected-row counting with the postgres-js driver.
 * `updateMany`/`deleteMany` run without `RETURNING`, and Drizzle's postgres-js
 * driver returns the raw postgres-js `Result`, an Array subclass whose affected
 * count lives only on `.count` (the array length is 0). The adapter matched the
 * `Array.isArray` branch first and returned `result.length` (0), so every
 * update/delete reported 0 affected rows. The count is now read from `.count`
 * before the array branch.
 *
 * @see https://github.com/better-auth/better-auth/pull/9489
 */
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

// Real table so the adapter can resolve the where clause; the fake db short
// circuits the actual query and returns a simulated postgres-js result.
const users = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

// postgres-js Result is an Array subclass carrying the affected-row count on
// `.count`; a non-returning write has length 0.
class PostgresJsResult extends Array {
	count = 0;
}
const makeResult = (count: number) => {
	const result = new PostgresJsResult();
	result.count = count;
	return result;
};

const makeAdapter = (result: PostgresJsResult) => {
	const fakeDb = {
		update: () => ({ set: () => ({ where: () => result }) }),
		delete: () => ({ where: () => result }),
	};
	return drizzleAdapter(fakeDb, {
		schema: { user: users },
		provider: "pg",
	})({});
};

describe("drizzle relations-v2 adapter: postgres-js affected row count", () => {
	it("updateMany reads the affected count from result.count", async () => {
		const adapter = makeAdapter(makeResult(3));
		const affected = await adapter.updateMany({
			model: "user",
			where: [{ field: "name", value: "old" }],
			update: { name: "new" },
		});

		expect(affected).toBe(3);
	});

	it("deleteMany reads the affected count from result.count", async () => {
		const adapter = makeAdapter(makeResult(2));
		const affected = await adapter.deleteMany({
			model: "user",
			where: [{ field: "name", value: "gone" }],
		});

		expect(affected).toBe(2);
	});
});
