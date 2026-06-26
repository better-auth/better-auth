/**
 * Regression test for case-insensitive where clauses on the joins path. The
 * adapter skipped the relational query whenever a where used `mode:
 * "insensitive"`, falling back to the non-relational SQL path. Under
 * `experimental.joins` the factory does not run its own fallback join, so the
 * joined data came back empty. Insensitive conditions are now routed through
 * `RAW`, so the relational query handles them and still performs the join.
 *
 * @see https://github.com/better-auth/better-auth/pull/9489
 */
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

describe("drizzle relations-v2 adapter: case-insensitive where on the joins path", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema: tables, relations });

	const adapter = drizzleAdapter(db, {
		schema: { ...tables, relations },
		provider: "sqlite",
	})({ experimental: { joins: true } });

	beforeEach(() => {
		sqliteDb.exec("DROP TABLE IF EXISTS session;");
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
			INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
			VALUES ('u1', 'Alice', 'alice@test.com', 0, NULL, ${nowTs}, ${nowTs});
		`);
		sqliteDb.exec(`
			INSERT INTO session (id, userId, createdAt, updatedAt)
			VALUES
				('s1', 'u1', ${nowTs}, ${nowTs}),
				('s2', 'u1', ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("findOne matches case-insensitively and still joins", async () => {
		const result = await adapter.findOne<Record<string, any>>({
			model: "user",
			where: [{ field: "name", value: "alice", mode: "insensitive" }],
			join: { session: true },
		});

		expect(result?.id).toBe("u1");
		expect(
			(result?.session as { id: string }[]).map((s) => s.id).sort(),
		).toEqual(["s1", "s2"]);
	});

	it("findMany matches case-insensitively and still joins", async () => {
		const result = await adapter.findMany<Record<string, any>>({
			model: "user",
			where: [{ field: "name", value: "ALICE", mode: "insensitive" }],
			join: { session: true },
		});

		expect(result).toHaveLength(1);
		expect(
			(result[0]?.session as { id: string }[]).map((s) => s.id).sort(),
		).toEqual(["s1", "s2"]);
	});

	it("findMany applies insensitive contains together with a join", async () => {
		const result = await adapter.findMany<Record<string, any>>({
			model: "user",
			where: [
				{
					field: "name",
					operator: "contains",
					value: "LIC",
					mode: "insensitive",
				},
			],
			join: { session: true },
		});

		expect(result.map((r) => r.id)).toEqual(["u1"]);
		expect((result[0]?.session as { id: string }[]).length).toBe(2);
	});
});
