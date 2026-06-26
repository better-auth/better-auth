/**
 * Drizzle keys `db.query` by the schema export names, commonly plural ("users"),
 * while Better Auth passes singular model names. The adapter read
 * `db.query[model]` directly, so a plural-keyed schema fell back to the
 * non-relational query, returning empty joins under `experimental.joins`.
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

// Plural schema keys, so `db.query` is keyed "users"/"sessions" while Better
// Auth still queries by the singular "user"/"session" model names.
const dbSchema = { users, sessions };
const relations = defineRelationsPart(dbSchema, (r) => ({
	users: {
		sessions: r.many.sessions({ from: r.users.id, to: r.sessions.userId }),
	},
	sessions: {
		user: r.one.users({ from: r.sessions.userId, to: r.users.id }),
	},
}));

describe("drizzle relations-v2 adapter: plural db.query keys", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema: dbSchema, relations });

	const adapter = drizzleAdapter(db, {
		schema: { user: users, session: sessions, relations },
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

	it("findOne resolves the plural query key and returns joined rows", async () => {
		const result = await adapter.findOne<Record<string, any>>({
			model: "user",
			where: [{ field: "id", value: "u1" }],
			join: { session: true },
		});

		expect(result?.id).toBe("u1");
		expect(Array.isArray(result?.session)).toBe(true);
		expect(
			(result?.session as { id: string }[]).map((s) => s.id).sort(),
		).toEqual(["s1", "s2"]);
	});

	it("findMany resolves the plural query key and returns joined rows", async () => {
		const result = await adapter.findMany<Record<string, any>>({
			model: "user",
			where: [{ field: "id", value: "u1" }],
			join: { session: true },
		});

		expect(result).toHaveLength(1);
		expect(
			(result[0]?.session as { id: string }[]).map((s) => s.id).sort(),
		).toEqual(["s1", "s2"]);
	});
});

describe("drizzle relations-v2 adapter: missing relational query namespace", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema: dbSchema, relations });
	// Simulate a db built without the relational-query namespace. The adapter
	// must fall back to the SQL path rather than dereference `undefined`.
	(db as { query?: unknown }).query = undefined;

	const adapter = drizzleAdapter(db, {
		schema: { user: users, session: sessions, relations },
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
			INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
			VALUES ('u1', 'Alice', 'alice@test.com', 0, NULL, ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("findOne falls back to the SQL path instead of throwing", async () => {
		const result = await adapter.findOne<Record<string, any>>({
			model: "user",
			where: [{ field: "id", value: "u1" }],
		});

		expect(result?.id).toBe("u1");
	});
});

describe("drizzle relations-v2 adapter: query key via relations internal", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema: dbSchema, relations });
	// Drizzle 1.0 drops the v1 `db._.fullSchema` internal, so the key lookup must
	// also work off `db._.relations`. Remove fullSchema to force that path.
	(db._ as { fullSchema?: unknown }).fullSchema = undefined;

	const adapter = drizzleAdapter(db, {
		schema: { user: users, session: sessions, relations },
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
			VALUES ('s1', 'u1', ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("resolves the plural key and joins via db._.relations", async () => {
		const result = await adapter.findOne<Record<string, any>>({
			model: "user",
			where: [{ field: "id", value: "u1" }],
			join: { session: true },
		});

		expect(result?.id).toBe("u1");
		expect((result?.session as { id: string }[]).map((s) => s.id)).toEqual([
			"s1",
		]);
	});
});
