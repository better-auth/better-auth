/**
 * Since drizzle-orm 1.0.0-rc.5, an explicit `where: undefined` in a relational
 * query throws ("Unexpected 'undefined' in filter value"). A joined `findMany`
 * without a `where` must leave the key out.
 */
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import Database from "better-sqlite3";
import { defineRelationsPart } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const users = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

const sessions = sqliteTable("session", {
	id: text("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => users.id),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

const tables = { user: users, session: sessions };
const relations = defineRelationsPart(tables, (r) => ({
	user: {
		sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
	},
	session: {
		user: r.one.user({ from: r.session.userId, to: r.user.id }),
	},
}));

describe("drizzle relations-v2 adapter: joined findMany without where", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema: tables, relations });

	const adapter = drizzleAdapter(db, {
		schema: { ...tables, relations },
		provider: "sqlite",
	})({
		advanced: { database: { joins: true } },
	});

	beforeAll(() => {
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
		sqliteDb.exec(`
			CREATE TABLE session (
				id TEXT PRIMARY KEY,
				userId TEXT NOT NULL REFERENCES user(id),
				createdAt INTEGER NOT NULL,
				updatedAt INTEGER NOT NULL
			);
		`);
		const nowTs = Date.now();
		sqliteDb.exec(`
			INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
			VALUES
				('u1', 'Alice', 'alice@test.com', 0, ${nowTs}, ${nowTs}),
				('u2', 'Bob', 'bob@test.com', 0, ${nowTs}, ${nowTs});
		`);
		sqliteDb.exec(`
			INSERT INTO session (id, userId, createdAt, updatedAt)
			VALUES
				('s1', 'u1', ${nowTs}, ${nowTs}),
				('s2', 'u2', ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12927
	 */
	it("omits the `where` key and returns every joined row", async () => {
		const findMany = vi.spyOn(db.query.session, "findMany");

		const result = await adapter.findMany<{
			id: string;
			user: { email: string };
		}>({
			model: "session",
			join: { user: true },
			sortBy: { field: "id", direction: "asc" },
		});

		expect(findMany).toHaveBeenCalledTimes(1);
		expect(findMany.mock.calls[0]![0]).not.toHaveProperty("where");
		expect(result.map((r) => [r.id, r.user.email])).toEqual([
			["s1", "alice@test.com"],
			["s2", "bob@test.com"],
		]);
	});
});
