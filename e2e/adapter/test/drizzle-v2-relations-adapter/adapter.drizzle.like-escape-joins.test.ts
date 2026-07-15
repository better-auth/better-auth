/**
 * With `experimental.joins`, `findMany` filters through Drizzle's relational
 * query object, whose `like` filter cannot carry `ESCAPE`. LIKE is routed
 * through `RAW`, so this checks `%` and `_` still match literally.
 *
 * @see https://www.sqlite.org/lang_expr.html
 */
import type { User } from "@better-auth/core/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import Database from "better-sqlite3";
import { defineRelationsPart } from "drizzle-orm";
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

const tables = { user: users };
const relations = defineRelationsPart(tables, () => ({ user: {} }));

describe("drizzle relations-v2 adapter: LIKE escaping on the joins path", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema: tables, relations });

	const adapter = drizzleAdapter(db, {
		schema: { ...tables, relations },
		provider: "sqlite",
		transaction: "sync",
	})({ advanced: { database: { joins: true } } });

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

	it("combines a literal-wildcard contains with another AND condition", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [
				{ field: "name", operator: "contains", value: "a%c" },
				{ field: "email", value: "u3@test.com" },
			],
		});

		expect(result.map((r) => r.id).sort()).toEqual(["u3"]);
	});

	it("combines literal-wildcard contains conditions with OR", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [
				{ field: "name", operator: "contains", value: "a_b", connector: "OR" },
				{ field: "name", operator: "contains", value: "a%c", connector: "OR" },
			],
		});

		expect(result.map((r) => r.id).sort()).toEqual(["u1", "u3"]);
	});
});
