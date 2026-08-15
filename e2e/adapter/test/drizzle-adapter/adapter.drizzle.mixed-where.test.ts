/**
 * @see https://github.com/better-auth/better-auth/issues/7271
 *
 * Validates that the Drizzle adapter correctly handles mixed AND/OR
 * connectors in `where` clauses. When `convertWhereClause` returns
 * both an AND group and an OR group, the joins code path uses only
 * `clause[0]`, silently dropping the second group.
 */
import type { User } from "@better-auth/core/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import Database from "better-sqlite3";
import { relations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

const drizzleSchema = {
	users,
	sessions,
	accounts,
	verifications,
	usersRelations,
	sessionsRelations,
	accountsRelations,
};

const adapterSchema = {
	user: users,
	session: sessions,
	account: accounts,
	verification: verifications,
};

describe("drizzle adapter: mixed AND/OR connectors in where clauses", () => {
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
		db = drizzle(sqliteDb, { schema: drizzleSchema });

		const nowTs = Date.now();
		sqliteDb.exec(`
			INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
			VALUES
				('u1', 'Admin User', 'admin@company.com', 0, ${nowTs}, ${nowTs}),
				('u2', 'Other Person', 'other@company.com', 0, ${nowTs}, ${nowTs}),
				('u3', 'External Admin', 'admin@external.com', 0, ${nowTs}, ${nowTs}),
				('u4', 'Random User', 'random@other.com', 0, ${nowTs}, ${nowTs});

			INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
			VALUES
				('s1', 'u1', 'token-1', ${nowTs + 86400000}, '127.0.0.1', 'vitest', ${nowTs}, ${nowTs}),
				('s2', 'u2', 'token-2', ${nowTs + 86400000}, '127.0.0.1', 'vitest', ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/7271
	 *
	 * WHERE (email LIKE '%company.com%') AND (name LIKE '%Admin%')
	 *
	 * AND group: email contains "company.com" → u1, u2
	 * OR group:  name contains "Admin"        → u1, u3
	 * Combined:  u1 only (intersection)
	 *
	 * If OR clause is dropped, only the AND group applies → u1, u2 (wrong)
	 */
	it("findMany (regular path) should apply both AND and OR groups correctly", async () => {
		const adapterFactory = drizzleAdapter(db, {
			schema: adapterSchema,
			provider: "sqlite",
		});
		const adapter = adapterFactory({});

		const result = await adapter.findMany<User>({
			model: "user",
			where: [
				{ field: "email", value: "company.com", operator: "contains" },
				{
					field: "name",
					value: "Admin",
					operator: "contains",
					connector: "OR",
				},
			],
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("u1");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/7271
	 *
	 * Same query on the experimental joins path.
	 * The bug: `clause[0]` is used, dropping the OR group entirely.
	 * Only the AND clause (email LIKE '%company.com%') is applied,
	 * returning u1 AND u2 instead of just u1.
	 */
	it("findMany (joins path) should apply both AND and OR groups correctly", async () => {
		const adapterFactory = drizzleAdapter(db, {
			schema: adapterSchema,
			provider: "sqlite",
		});
		const adapter = adapterFactory({
			experimental: { joins: true },
		});

		const result = await adapter.findMany<User>({
			model: "user",
			where: [
				{ field: "email", value: "company.com", operator: "contains" },
				{
					field: "name",
					value: "Admin",
					operator: "contains",
					connector: "OR",
				},
			],
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("u1");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/7271
	 *
	 * findOne with mixed AND/OR on the joins path.
	 * WHERE (name LIKE '%Person%') AND (email LIKE '%other%')
	 *
	 * AND group: name contains "Person" → u2
	 * OR group:  email contains "other" → u2, u4
	 * Combined:  u2 only
	 *
	 * If OR is dropped, name LIKE '%Person%' → u2
	 * (same result in this case, but the query semantics are still wrong)
	 *
	 * More telling: use a query where dropping OR broadens the result.
	 * WHERE (email LIKE '%company.com%') AND (name LIKE '%Admin%')
	 * If OR dropped → returns u1,u2 but findOne returns first match.
	 * We verify the query returns the correct single match.
	 */
	it("findOne (joins path) should apply both AND and OR groups correctly", async () => {
		const adapterFactory = drizzleAdapter(db, {
			schema: adapterSchema,
			provider: "sqlite",
		});
		const adapter = adapterFactory({
			experimental: { joins: true },
		});

		const result = await adapter.findOne<User>({
			model: "user",
			where: [
				{ field: "email", value: "random@other.com" },
				{
					field: "name",
					value: "Random",
					operator: "contains",
					connector: "OR",
				},
			],
		});

		expect(result).not.toBeNull();
		expect(result?.id).toBe("u4");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/7271
	 *
	 * Negative case: mixed AND/OR where the AND clause matches but
	 * the OR clause does NOT match. Result should be empty.
	 *
	 * AND group: email LIKE '%company.com%' → u1, u2
	 * OR group:  name LIKE '%Nonexistent%'  → none
	 * Combined:  empty (AND matches intersected with OR that matches nothing)
	 *
	 * If OR is dropped: u1, u2 are returned (wrong!)
	 */
	it("findMany (joins path) should return empty when OR group matches nothing", async () => {
		const adapterFactory = drizzleAdapter(db, {
			schema: adapterSchema,
			provider: "sqlite",
		});
		const adapter = adapterFactory({
			experimental: { joins: true },
		});

		const result = await adapter.findMany<User>({
			model: "user",
			where: [
				{ field: "email", value: "company.com", operator: "contains" },
				{
					field: "name",
					value: "Nonexistent",
					operator: "contains",
					connector: "OR",
				},
			],
		});

		expect(result).toHaveLength(0);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/7271
	 *
	 * Multiple AND conditions + multiple OR conditions on the joins path.
	 *
	 * AND group: email LIKE '%@%' AND emailVerified = false → u1, u2, u3, u4
	 * OR group:  name LIKE '%Admin%' OR name LIKE '%Random%' → u1, u3, u4
	 * Combined:  u1, u3, u4
	 *
	 * If OR dropped: u1, u2, u3, u4 (wrong, includes u2)
	 */
	it("findMany (joins path) should handle multiple AND + multiple OR conditions", async () => {
		const adapterFactory = drizzleAdapter(db, {
			schema: adapterSchema,
			provider: "sqlite",
		});
		const adapter = adapterFactory({
			experimental: { joins: true },
		});

		const result = await adapter.findMany<User>({
			model: "user",
			where: [
				{ field: "email", value: "@", operator: "contains" },
				{ field: "emailVerified", value: false },
				{
					field: "name",
					value: "Admin",
					operator: "contains",
					connector: "OR",
				},
				{
					field: "name",
					value: "Random",
					operator: "contains",
					connector: "OR",
				},
			],
		});

		expect(result).toHaveLength(3);
		const ids = result.map((r) => r.id).sort();
		expect(ids).toEqual(["u1", "u3", "u4"]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/7271
	 *
	 * findOne (joins path) should return null when the AND clause
	 * matches but the OR clause excludes all those matches.
	 *
	 * AND group: email = 'other@company.com' → u2
	 * OR group:  name LIKE '%Admin%'          → u1, u3
	 * Combined:  empty (u2 not in OR set)
	 *
	 * If OR dropped: u2 is returned (wrong!)
	 */
	it("findOne (joins path) should return null when AND matches but OR excludes", async () => {
		const adapterFactory = drizzleAdapter(db, {
			schema: adapterSchema,
			provider: "sqlite",
		});
		const adapter = adapterFactory({
			experimental: { joins: true },
		});

		const result = await adapter.findOne<User>({
			model: "user",
			where: [
				{ field: "email", value: "other@company.com" },
				{
					field: "name",
					value: "Admin",
					operator: "contains",
					connector: "OR",
				},
			],
		});

		expect(result).toBeNull();
	});
});
