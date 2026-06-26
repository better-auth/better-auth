/**
 * `contains`/`starts_with`/`ends_with` backslash-escape `%` and `_`, but the
 * `LIKE` clause omitted `ESCAPE`. SQLite has no default escape character, so
 * the backslash matched literally and a value with `_` or `%` returned the
 * wrong rows.
 *
 * @see https://www.sqlite.org/lang_expr.html
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

describe("drizzle relations-v2 adapter: LIKE wildcard escaping", () => {
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
		// `a_b` and `a%c` hold literal wildcard characters. `axb` and `abc` are the
		// rows that a wildcard would wrongly match if the escape were dropped.
		sqliteDb.exec(`
			INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
			VALUES
				('u1', 'a_b', 'u1@test.com', 0, NULL, ${nowTs}, ${nowTs}),
				('u2', 'axb', 'u2@test.com', 0, NULL, ${nowTs}, ${nowTs}),
				('u3', 'a%c', 'u3@test.com', 0, NULL, ${nowTs}, ${nowTs}),
				('u4', 'abc', 'u4@test.com', 0, NULL, ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("contains treats an underscore as a literal character", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [{ field: "name", operator: "contains", value: "a_b" }],
		});

		expect(result.map((r) => r.id).sort()).toEqual(["u1"]);
	});

	it("contains treats a percent sign as a literal character", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [{ field: "name", operator: "contains", value: "a%c" }],
		});

		expect(result.map((r) => r.id).sort()).toEqual(["u3"]);
	});

	it("starts_with treats an underscore as a literal character", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [{ field: "name", operator: "starts_with", value: "a_" }],
		});

		expect(result.map((r) => r.id).sort()).toEqual(["u1"]);
	});

	it("ends_with treats an underscore as a literal character", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [{ field: "name", operator: "ends_with", value: "_b" }],
		});

		expect(result.map((r) => r.id).sort()).toEqual(["u1"]);
	});
});
