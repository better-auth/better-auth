/**
 * Mixing default/`AND` conditions with `OR` must apply as
 * `(AND group) AND (OR group)`. The adapter passed both groups as two
 * arguments to Drizzle's single-argument `.where()`, silently dropping the OR
 * group.
 *
 * @see https://github.com/better-auth/better-auth/pull/9489
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

const schema = { user: users };

describe("drizzle relations-v2 adapter: mixed AND/OR where clauses", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema });

	const adapter = drizzleAdapter(db, {
		schema,
		provider: "sqlite",
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
		// image = 'keep.png' is the AND condition; name in (Alice, Bob) is the OR
		// group. Only u1 and u2 satisfy both. u3 satisfies AND but not OR, so it
		// is the row that leaks through when the OR group is dropped.
		sqliteDb.exec(`
			INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
			VALUES
				('u1', 'Alice', 'alice@test.com', 0, 'keep.png',  ${nowTs}, ${nowTs}),
				('u2', 'Bob',   'bob@test.com',   0, 'keep.png',  ${nowTs}, ${nowTs}),
				('u3', 'Carol', 'carol@test.com', 0, 'keep.png',  ${nowTs}, ${nowTs}),
				('u4', 'Alice', 'alice2@test.com',0, 'other.png', ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("findMany applies the AND group and the OR group together", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [
				{ field: "image", value: "keep.png" },
				{ field: "name", value: "Alice", connector: "OR" },
				{ field: "name", value: "Bob", connector: "OR" },
			],
		});

		expect(result.map((r) => r.id).sort()).toEqual(["u1", "u2"]);
	});

	it("findOne applies the AND group and the OR group together", async () => {
		const result = await adapter.findOne<User>({
			model: "user",
			where: [
				{ field: "image", value: "keep.png" },
				{ field: "name", value: "Bob", connector: "OR" },
				{ field: "name", value: "Carol", connector: "OR" },
			],
		});

		expect(result?.id).toBe("u2");
	});

	it("update only touches rows matching both the AND and OR groups", async () => {
		await adapter.updateMany({
			model: "user",
			where: [
				{ field: "image", value: "keep.png" },
				{ field: "name", value: "Alice", connector: "OR" },
				{ field: "name", value: "Bob", connector: "OR" },
			],
			update: { image: "claimed.png" },
		});

		const claimed = await adapter.findMany<User>({
			model: "user",
			where: [{ field: "image", value: "claimed.png" }],
		});
		expect(claimed.map((r) => r.id).sort()).toEqual(["u1", "u2"]);

		// u3 satisfies the AND group only, so it must keep its original image.
		const carol = await adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: "u3" }],
		});
		expect(carol?.image).toBe("keep.png");
	});
});
