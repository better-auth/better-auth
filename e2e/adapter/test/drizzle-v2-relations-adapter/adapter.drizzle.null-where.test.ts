/**
 * @see https://github.com/better-auth/better-auth/issues/7271
 *
 * Regression test for `convertWhereClause` in the relations-v2 Drizzle
 * adapter. `eq(column, null)` compiles to `column = NULL` in SQL, which is
 * never true (SQL three-valued logic), and `ne(column, null)` compiles to
 * `column != NULL`, which is never true either. They must instead emit
 * `column IS NULL` / `column IS NOT NULL`.
 *
 * This broke the device-authorization plugin: the claim step issues an
 * `update` with `{ field: "userId", operator: "eq", value: null }` to find
 * the unclaimed pending row. With `= NULL` the UPDATE matched zero rows
 * silently, so device codes were never claimed and approval always failed
 * with "Device code has not been claimed by a verifying session."
 */
import type { User } from "@better-auth/core/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const users = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

const adapterSchema = { user: users };

describe("drizzle relations-v2 adapter: null comparisons in where clauses", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema: { users } });

	const adapter = drizzleAdapter(db, {
		schema: adapterSchema,
		provider: "sqlite",
		transaction: "sync",
	})({});

	beforeEach(() => {
		sqliteDb.exec("DROP TABLE IF EXISTS user;");
		sqliteDb.exec(`
			CREATE TABLE user (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT NOT NULL,
				emailVerified INTEGER NOT NULL DEFAULT 0,
				image TEXT,
				createdAt INTEGER NOT NULL,
				updatedAt INTEGER NOT NULL
			);
		`);
		const nowTs = Date.now();
		// u1 and u3 have a NULL image; u2 has a non-null image.
		sqliteDb.exec(`
			INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
			VALUES
				('u1', 'No Image One', 'one@test.com', 0, NULL, ${nowTs}, ${nowTs}),
				('u2', 'Has Image', 'two@test.com', 0, 'avatar.png', ${nowTs}, ${nowTs}),
				('u3', 'No Image Two', 'three@test.com', 0, NULL, ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("findMany with `eq` null matches IS NULL rows", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [{ field: "image", operator: "eq", value: null }],
		});

		const ids = result.map((r) => r.id).sort();
		expect(ids).toEqual(["u1", "u3"]);
	});

	it("findMany with `ne` null matches IS NOT NULL rows", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [{ field: "image", operator: "ne", value: null }],
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("u2");
	});

	it("findOne with `eq` null finds an IS NULL row", async () => {
		const result = await adapter.findOne<User>({
			model: "user",
			where: [
				{ field: "image", operator: "eq", value: null },
				{ field: "id", value: "u3" },
			],
		});

		expect(result?.id).toBe("u3");
	});

	/**
	 * The device-authorization claim regression: an UPDATE keyed on a NULL
	 * column must match the unclaimed rows instead of silently matching none.
	 */
	it("update with `eq` null applies to IS NULL rows (device-auth claim path)", async () => {
		await adapter.update({
			model: "user",
			where: [{ field: "image", operator: "eq", value: null }],
			update: { image: "claimed.png" },
		});

		const claimed = await adapter.findMany<User>({
			model: "user",
			where: [{ field: "image", value: "claimed.png" }],
		});
		const claimedIds = claimed.map((r) => r.id).sort();
		expect(claimedIds).toEqual(["u1", "u3"]);

		// The previously non-null row is untouched.
		const untouched = await adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: "u2" }],
		});
		expect(untouched?.image).toBe("avatar.png");
	});
});
