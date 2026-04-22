/**
 * Regression test: db.query[model] lookup fails when the Drizzle schema
 * object passed to drizzle() has plural export names ("users", "sessions")
 * but config.schema maps singular Better Auth model names to the tables.
 *
 * This is the standard setup when users have a hand-written Drizzle schema
 * (common with ORMs) and map it to Better Auth's singular model names:
 *
 *   drizzleAdapter(db, {
 *     schema: { user: schema.users, session: schema.sessions, ... },
 *     provider: "pg",
 *   })
 *
 * The adapter correctly resolves getSchema("user") → schema.users via
 * config.schema, but the join code path does db.query["user"] directly,
 * which fails because db.query keys are "users", "sessions", etc.
 */
import type { Session, User } from "@better-auth/core/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import Database from "better-sqlite3";
import { relations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ── Schema with PLURAL export names (typical Drizzle convention) ──

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
	token: text("token").notNull(),
	expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
	ipAddress: text("ipAddress"),
	userAgent: text("userAgent"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

const accounts = sqliteTable("account", {
	id: text("id").primaryKey(),
	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => users.id),
	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	accessTokenExpiresAt: integer("accessTokenExpiresAt", {
		mode: "timestamp",
	}),
	refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
		mode: "timestamp",
	}),
	scope: text("scope"),
	password: text("password"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

const verifications = sqliteTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
	createdAt: integer("createdAt", { mode: "timestamp" }),
	updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

// ── Relations ──

const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	accounts: many(accounts),
}));

const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

// Schema passed to drizzle() — keys are plural JS export names.
// db.query keys: "users", "sessions", "accounts", "verifications"
const drizzleSchema = {
	users,
	sessions,
	accounts,
	verifications,
	usersRelations,
	sessionsRelations,
	accountsRelations,
};

// Schema passed to the adapter — keys are SINGULAR Better Auth model names.
// This is the standard config pattern: { user: schema.users, session: schema.sessions, ... }
const adapterSchema = {
	user: users,
	session: sessions,
	account: accounts,
	verification: verifications,
};

// ── Tests ──

describe("drizzle adapter: singular config.schema keys with plural db.query keys + experimental.joins", () => {
	let sqliteDb: InstanceType<typeof Database>;
	let db: ReturnType<typeof drizzle>;

	beforeAll(() => {
		sqliteDb = new Database(":memory:");
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
			CREATE TABLE session (
				id TEXT PRIMARY KEY,
				userId TEXT NOT NULL REFERENCES user(id),
				token TEXT NOT NULL,
				expiresAt INTEGER NOT NULL,
				ipAddress TEXT,
				userAgent TEXT,
				createdAt INTEGER NOT NULL,
				updatedAt INTEGER NOT NULL
			);
			CREATE TABLE account (
				id TEXT PRIMARY KEY,
				accountId TEXT NOT NULL,
				providerId TEXT NOT NULL,
				userId TEXT NOT NULL REFERENCES user(id),
				accessToken TEXT,
				refreshToken TEXT,
				idToken TEXT,
				accessTokenExpiresAt INTEGER,
				refreshTokenExpiresAt INTEGER,
				scope TEXT,
				password TEXT,
				createdAt INTEGER NOT NULL,
				updatedAt INTEGER NOT NULL
			);
			CREATE TABLE verification (
				id TEXT PRIMARY KEY,
				identifier TEXT NOT NULL,
				value TEXT NOT NULL,
				expiresAt INTEGER NOT NULL,
				createdAt INTEGER,
				updatedAt INTEGER
			);
		`);
		// db.query keys will be: "users", "sessions", "accounts", "verifications"
		db = drizzle(sqliteDb, { schema: drizzleSchema });
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("findOne should use relational query (not fall back) when db.query keys differ from model names", async () => {
		const adapterFactory = drizzleAdapter(db, {
			// Singular keys — matches Better Auth internal model names
			schema: adapterSchema,
			provider: "sqlite",
			// usePlural is NOT set (default: false) — this is the common config
		});

		const adapter = adapterFactory({
			experimental: { joins: true },
		});

		const now = new Date();
		const nowTs = now.getTime();

		// Seed data via raw SQL to avoid adapter id-generation issues in test
		sqliteDb.exec(`
			INSERT OR REPLACE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
			VALUES ('u1', 'Test User', 'test@example.com', 0, ${nowTs}, ${nowTs});

			INSERT OR REPLACE INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
			VALUES ('s1', 'u1', 'test-token', ${nowTs + 86400000}, '127.0.0.1', 'vitest', ${nowTs}, ${nowTs});
		`);

		// findOne WITHOUT join — should work regardless (baseline)
		const userBasic = await adapter.findOne<User>({
			model: "user",
			where: [{ field: "email", value: "test@example.com" }],
		});
		expect(userBasic).not.toBeNull();
		expect(userBasic?.id).toBe("u1");

		// findOne WITH join — this is the bug path.
		// The adapter does db.query["user"].findFirst() but db.query has "users" not "user".
		// Without the fix: falls back to SELECT, session data is lost.
		const userWithSessions = await adapter.findOne<
			User & { session: Session[] }
		>({
			model: "user",
			where: [{ field: "id", value: "u1" }],
			join: {
				session: true,
			},
		});

		expect(userWithSessions).not.toBeNull();
		expect(userWithSessions?.id).toBe("u1");
		// Critical assertion: joined session data must be present.
		// Without the fix, the adapter falls back to a plain SELECT and
		// session data is undefined.
		expect(userWithSessions?.session).toBeDefined();
		expect(Array.isArray(userWithSessions?.session)).toBe(true);
		expect(userWithSessions?.session).toHaveLength(1);
		expect(userWithSessions?.session[0]?.id).toBe("s1");
	});

	it("findMany should use relational query (not fall back) when db.query keys differ from model names", async () => {
		const adapterFactory = drizzleAdapter(db, {
			schema: adapterSchema,
			provider: "sqlite",
		});

		const adapter = adapterFactory({
			experimental: { joins: true },
		});

		// findMany with join — exercises the findMany join path
		const allUsers = await adapter.findMany<User & { session: Session[] }>({
			model: "user",
			join: {
				session: true,
			},
		});

		expect(allUsers).toHaveLength(1);
		expect(allUsers[0]?.id).toBe("u1");
		// Same critical assertion: joined data must be present
		expect(allUsers[0]?.session).toBeDefined();
		expect(Array.isArray(allUsers[0]?.session)).toBe(true);
		expect(allUsers[0]?.session).toHaveLength(1);
	});
});
