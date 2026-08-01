/**
 * With `usePlural`, the schema generator still names a relation backed by a
 * foreign key on the base model after the singular model ("user"), while the
 * table exports stay plural ("users"). The adapter derived the relation key
 * from the plural model name, so every one-to-one join asked Drizzle for a
 * relation that does not exist and the query blew up inside the relational
 * query builder.
 *
 * @see https://github.com/better-auth/better-auth/issues/10616
 */
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import Database from "better-sqlite3";
import { defineRelationsPart } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

const sessions = sqliteTable("sessions", {
	id: text("id").primaryKey(),
	token: text("token").notNull(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Mirrors the generated schema for `usePlural`: plural table exports, plural
// keys for the reverse one-to-many relation, singular keys for the relation
// backed by the foreign key on the base model.
const dbSchema = { users, sessions };
const authRelations = defineRelationsPart(dbSchema, (r) => ({
	users: {
		sessions: r.many.sessions({ from: r.users.id, to: r.sessions.userId }),
	},
	sessions: {
		user: r.one.users({ from: r.sessions.userId, to: r.users.id }),
	},
}));

describe("drizzle relations-v2 adapter: one-to-one joins with usePlural", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, relations: authRelations });

	const adapter = drizzleAdapter(db, {
		schema: { ...dbSchema, authRelations },
		provider: "sqlite",
		usePlural: true,
	})({
		advanced: { database: { joins: true } },
	});

	beforeEach(() => {
		sqliteDb.exec("DROP TABLE IF EXISTS sessions;");
		sqliteDb.exec("DROP TABLE IF EXISTS users;");
		sqliteDb.exec(`
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				email TEXT NOT NULL,
				email_verified INTEGER NOT NULL DEFAULT 0,
				image TEXT,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`);
		sqliteDb.exec(`
			CREATE TABLE sessions (
				id TEXT PRIMARY KEY,
				token TEXT NOT NULL,
				expires_at INTEGER NOT NULL,
				user_id TEXT NOT NULL REFERENCES users(id),
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`);
		const nowTs = Date.now();
		sqliteDb.exec(`
			INSERT INTO users (id, name, email, email_verified, image, created_at, updated_at)
			VALUES ('u1', 'Alice', 'alice@test.com', 0, NULL, ${nowTs}, ${nowTs});
		`);
		sqliteDb.exec(`
			INSERT INTO sessions (id, token, expires_at, user_id, created_at, updated_at)
			VALUES
				('s1', 'tok1', ${nowTs}, 'u1', ${nowTs}, ${nowTs}),
				('s2', 'tok2', ${nowTs}, 'u1', ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("findOne joins the user of a session under the plural model name", async () => {
		const result = await adapter.findOne<Record<string, any>>({
			model: "session",
			where: [{ field: "token", value: "tok1" }],
			join: { user: true },
		});

		expect(result?.id).toBe("s1");
		expect(result?.user?.id).toBe("u1");
	});

	it("findMany joins the user of a session under the plural model name", async () => {
		const result = await adapter.findMany<Record<string, any>>({
			model: "session",
			where: [{ field: "userId", value: "u1" }],
			join: { user: true },
		});

		expect(result.map((session) => session.id).sort()).toEqual(["s1", "s2"]);
		for (const session of result) {
			expect(session.user?.id).toBe("u1");
		}
	});

	it("still resolves the reverse one-to-many relation key", async () => {
		const result = await adapter.findOne<Record<string, any>>({
			model: "user",
			where: [{ field: "id", value: "u1" }],
			join: { session: true },
		});

		expect(result?.id).toBe("u1");
		expect(
			(result?.session as { id: string }[]).map((s) => s.id).sort(),
		).toEqual(["s1", "s2"]);
	});
});
