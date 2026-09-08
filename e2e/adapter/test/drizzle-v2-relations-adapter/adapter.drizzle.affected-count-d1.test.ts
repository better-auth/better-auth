/**
 * `updateMany`/`deleteMany` run without `RETURNING`, and the Cloudflare D1 driver
 * resolves them to a `D1Result` whose affected-row count lives at `meta.changes`,
 * not at the top level. The adapter only checked top-level fields, so D1 writes
 * reported 0 affected rows. The count is now read from `meta.changes`.
 *
 * @see https://developers.cloudflare.com/d1/worker-api/return-object/
 */
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

// Real table so the adapter can resolve the where clause. The fake db short
// circuits the actual query and returns a simulated D1 result.
const users = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

// Cloudflare D1 returns a `D1Result` object. A non-returning write carries the
// affected-row count at `meta.changes`, with no top-level count field.
const makeResult = (changes: number) => ({
	results: [],
	success: true,
	meta: { changes, last_row_id: 0, served_by: "test" },
});

const makeAdapter = (result: ReturnType<typeof makeResult>) => {
	const fakeDb = {
		update: () => ({ set: () => ({ where: () => result }) }),
		delete: () => ({ where: () => result }),
	};
	return drizzleAdapter(fakeDb, {
		schema: { user: users },
		provider: "sqlite",
	})({});
};

describe("drizzle relations-v2 adapter: Cloudflare D1 affected row count", () => {
	it("updateMany reads the affected count from meta.changes", async () => {
		const adapter = makeAdapter(makeResult(3));
		const affected = await adapter.updateMany({
			model: "user",
			where: [{ field: "name", value: "old" }],
			update: { name: "new" },
		});

		expect(affected).toBe(3);
	});

	it("deleteMany reads the affected count from meta.changes", async () => {
		const adapter = makeAdapter(makeResult(2));
		const affected = await adapter.deleteMany({
			model: "user",
			where: [{ field: "name", value: "gone" }],
		});

		expect(affected).toBe(2);
	});
});
