/**
 * Under `experimental.joins`, a `where` with `mode: "insensitive"` must fall back
 * to the SQL builder instead of silently degrading to a case-sensitive match.
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

const schema = { user: users };
// Empty relations still register `db.query.user`, so queries take the joins path.
const relations = defineRelationsPart(schema);

describe("drizzle relations-v2 adapter: joins path honors insensitive mode", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema, relations });

	const adapter = drizzleAdapter(db, {
		schema,
		provider: "sqlite",
	})({ experimental: { joins: true } });

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
			INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
			VALUES ('u1', 'Mixed Case', 'person@test.com', 0, ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("findOne with `mode: insensitive` matches a different-case value", async () => {
		const result = await adapter.findOne<User>({
			model: "user",
			where: [
				{ field: "email", value: "PERSON@TEST.COM", mode: "insensitive" },
			],
		});

		expect(result?.id).toBe("u1");
	});

	it("findMany with `mode: insensitive` matches a different-case value", async () => {
		const result = await adapter.findMany<User>({
			model: "user",
			where: [
				{ field: "email", value: "Person@Test.com", mode: "insensitive" },
			],
		});

		expect(result.map((r) => r.id)).toEqual(["u1"]);
	});

	it("default (sensitive) lookup is unaffected and still exact-matches", async () => {
		const exact = await adapter.findOne<User>({
			model: "user",
			where: [{ field: "email", value: "person@test.com" }],
		});
		expect(exact?.id).toBe("u1");
	});
});
