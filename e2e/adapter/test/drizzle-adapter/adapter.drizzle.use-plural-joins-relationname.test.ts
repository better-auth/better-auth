/**
 * @see https://github.com/better-auth/better-auth/issues/8849
 *
 * Generated usePlural schemas must disambiguate multiple relations between the
 * same tables while preserving the relation keys used by adapter joins.
 */
import type { Account, User } from "@better-auth/core/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import Database from "better-sqlite3";
import { relations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

const sessions = sqliteTable("sessions", {
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

const accounts = sqliteTable("accounts", {
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

const verifications = sqliteTable("verifications", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
	createdAt: integer("createdAt", { mode: "timestamp" }),
	updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

/** Current main CLI usePlural output: plural many-to-one keys (`users`). */
const usersRelationsCliMain = relations(users, ({ many }) => ({
	sessions: many(sessions),
	accounts: many(accounts),
}));

const accountsRelationsCliMain = relations(accounts, ({ one }) => ({
	users: one(users, {
		fields: [accounts.userId],
		references: [users.id],
	}),
}));

const sessionsRelationsCliMain = relations(sessions, ({ one }) => ({
	users: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));

/** Multi-FK relation shape emitted by the CLI. */
const sessionsWithImpersonation = sqliteTable("sessions_imp", {
	id: text("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => users.id),
	impersonatedBy: text("impersonatedBy").references(() => users.id),
	token: text("token").notNull(),
	expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

const usersRelationsMultiFk = relations(users, ({ many }) => ({
	sessions_impByUserId: many(sessionsWithImpersonation, {
		relationName: "sessions_imp_userId",
	}),
	sessions_impByImpersonatedBy: many(sessionsWithImpersonation, {
		relationName: "sessions_imp_impersonatedBy",
	}),
}));

const sessionsMultiFkRelations = relations(
	sessionsWithImpersonation,
	({ one }) => ({
		user: one(users, {
			fields: [sessionsWithImpersonation.userId],
			references: [users.id],
			relationName: "sessions_imp_userId",
		}),
		impersonator: one(users, {
			fields: [sessionsWithImpersonation.impersonatedBy],
			references: [users.id],
			relationName: "sessions_imp_impersonatedBy",
		}),
	}),
);

function createTables(sqliteDb: InstanceType<typeof Database>) {
	sqliteDb.exec(`
		CREATE TABLE users (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			emailVerified INTEGER NOT NULL DEFAULT 0,
			image TEXT,
			createdAt INTEGER NOT NULL,
			updatedAt INTEGER NOT NULL
		);
		CREATE TABLE sessions (
			id TEXT PRIMARY KEY,
			userId TEXT NOT NULL REFERENCES users(id),
			token TEXT NOT NULL,
			expiresAt INTEGER NOT NULL,
			ipAddress TEXT,
			userAgent TEXT,
			createdAt INTEGER NOT NULL,
			updatedAt INTEGER NOT NULL
		);
		CREATE TABLE accounts (
			id TEXT PRIMARY KEY,
			accountId TEXT NOT NULL,
			providerId TEXT NOT NULL,
			userId TEXT NOT NULL REFERENCES users(id),
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
		CREATE TABLE verifications (
			id TEXT PRIMARY KEY,
			identifier TEXT NOT NULL,
			value TEXT NOT NULL,
			expiresAt INTEGER NOT NULL,
			createdAt INTEGER,
			updatedAt INTEGER
		);
		CREATE TABLE sessions_imp (
			id TEXT PRIMARY KEY,
			userId TEXT NOT NULL REFERENCES users(id),
			impersonatedBy TEXT REFERENCES users(id),
			token TEXT NOT NULL,
			expiresAt INTEGER NOT NULL,
			createdAt INTEGER NOT NULL,
			updatedAt INTEGER NOT NULL
		);
	`);
}

function seedAuthRows(sqliteDb: InstanceType<typeof Database>, nowTs: number) {
	sqliteDb.exec(`
		INSERT OR REPLACE INTO users (id, name, email, emailVerified, createdAt, updatedAt)
		VALUES ('u1', 'Test User', 'test@example.com', 0, ${nowTs}, ${nowTs});

		INSERT OR REPLACE INTO accounts (id, accountId, providerId, userId, password, createdAt, updatedAt)
		VALUES ('a1', 'a1', 'credential', 'u1', 'hashed', ${nowTs}, ${nowTs});

		INSERT OR REPLACE INTO sessions (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
		VALUES ('s1', 'u1', 'test-token', ${nowTs + 86400000}, '127.0.0.1', 'vitest', ${nowTs}, ${nowTs});

		INSERT OR REPLACE INTO sessions_imp (id, userId, impersonatedBy, token, expiresAt, createdAt, updatedAt)
		VALUES ('si1', 'u1', null, 'imp-token', ${nowTs + 86400000}, ${nowTs}, ${nowTs});
	`);
}

describe("drizzle adapter: usePlural + joins + ambiguous relations (#8849)", () => {
	let sqliteDb: InstanceType<typeof Database>;

	beforeAll(() => {
		sqliteDb = new Database(":memory:");
		createTables(sqliteDb);
		seedAuthRows(sqliteDb, Date.now());
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("queries both sides of multiple named relations without ambiguity", async () => {
		const db = drizzle(sqliteDb, {
			schema: {
				users,
				sessionsWithImpersonation,
				usersRelationsMultiFk,
				sessionsMultiFkRelations,
			},
		});

		const user = await db.query.users.findFirst({
			with: {
				sessions_impByUserId: true,
				sessions_impByImpersonatedBy: true,
			},
		});
		expect(user?.sessions_impByUserId).toHaveLength(1);
		expect(user?.sessions_impByImpersonatedBy).toHaveLength(0);

		const session = await db.query.sessionsWithImpersonation.findFirst({
			with: {
				user: true,
				impersonator: true,
			},
		});
		expect(session?.user.id).toBe("u1");
		expect(session?.impersonator).toBeNull();
	});

	it("clean CLI usePlural relations work with usePlural + joins (control)", async () => {
		const db = drizzle(sqliteDb, {
			schema: {
				users,
				sessions,
				accounts,
				verifications,
				usersRelationsCliMain,
				accountsRelationsCliMain,
				sessionsRelationsCliMain,
			},
		});

		const adapter = drizzleAdapter(db, {
			schema: {
				users,
				sessions,
				accounts,
				verifications,
			},
			provider: "sqlite",
			usePlural: true,
		})({
			experimental: { joins: true },
		});

		const userWithAccounts = await adapter.findOne<
			User & { account: Account[] }
		>({
			model: "user",
			where: [{ field: "id", value: "u1" }],
			join: {
				account: true,
			},
		});

		expect(userWithAccounts).not.toBeNull();
		expect(userWithAccounts?.account).toBeDefined();
		expect(userWithAccounts?.account).toHaveLength(1);
		expect(userWithAccounts?.account[0]?.id).toBe("a1");

		const accountWithUser = await adapter.findOne<Account & { user: User }>({
			model: "account",
			where: [{ field: "id", value: "a1" }],
			join: {
				user: true,
			},
		});

		expect(accountWithUser?.user?.id).toBe("u1");
	});
});
