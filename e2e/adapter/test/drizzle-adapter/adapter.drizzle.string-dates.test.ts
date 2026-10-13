import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import {
	boolean as pgBoolean,
	pgTable,
	text as pgText,
	timestamp,
} from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Dates read back from a column without a time zone are only wrong when the
// server's zone is not UTC.
const originalTZ = process.env.TZ;
beforeAll(() => {
	process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
	process.env.TZ = originalTZ;
});

const pgDate = (name: string) =>
	timestamp(name, { mode: "string", precision: 3 });
const pgSchema = {
	user: pgTable("user", {
		id: pgText("id").primaryKey(),
		name: pgText("name").notNull(),
		email: pgText("email").notNull().unique(),
		emailVerified: pgBoolean("email_verified").notNull(),
		image: pgText("image"),
		createdAt: pgDate("created_at").notNull(),
		updatedAt: pgDate("updated_at").notNull(),
	}),
	session: pgTable("session", {
		id: pgText("id").primaryKey(),
		expiresAt: pgDate("expires_at").notNull(),
		token: pgText("token").notNull().unique(),
		createdAt: pgDate("created_at").notNull(),
		updatedAt: pgDate("updated_at").notNull(),
		ipAddress: pgText("ip_address"),
		userAgent: pgText("user_agent"),
		userId: pgText("user_id").notNull(),
	}),
	account: pgTable("account", {
		id: pgText("id").primaryKey(),
		accountId: pgText("account_id").notNull(),
		providerId: pgText("provider_id").notNull(),
		userId: pgText("user_id").notNull(),
		accessToken: pgText("access_token"),
		refreshToken: pgText("refresh_token"),
		idToken: pgText("id_token"),
		accessTokenExpiresAt: pgDate("access_token_expires_at"),
		refreshTokenExpiresAt: pgDate("refresh_token_expires_at"),
		scope: pgText("scope"),
		password: pgText("password"),
		createdAt: pgDate("created_at").notNull(),
		updatedAt: pgDate("updated_at").notNull(),
	}),
	verification: pgTable("verification", {
		id: pgText("id").primaryKey(),
		identifier: pgText("identifier").notNull(),
		value: pgText("value").notNull(),
		expiresAt: pgDate("expires_at").notNull(),
		createdAt: pgDate("created_at").notNull(),
		updatedAt: pgDate("updated_at").notNull(),
	}),
};

const sqliteSchema = {
	user: sqliteTable("user", {
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
		image: text("image"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	}),
	session: sqliteTable("session", {
		id: text("id").primaryKey(),
		expiresAt: text("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id").notNull(),
	}),
	account: sqliteTable("account", {
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: text("access_token_expires_at"),
		refreshTokenExpiresAt: text("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	}),
	verification: sqliteTable("verification", {
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: text("expires_at").notNull(),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	}),
};

function ddl(id: string, bool: string, date: string) {
	return [
		`CREATE TABLE user (id ${id} PRIMARY KEY, name TEXT NOT NULL, email ${id} NOT NULL UNIQUE, email_verified ${bool} NOT NULL, image TEXT, created_at ${date} NOT NULL, updated_at ${date} NOT NULL)`,
		`CREATE TABLE session (id ${id} PRIMARY KEY, expires_at ${date} NOT NULL, token ${id} NOT NULL UNIQUE, created_at ${date} NOT NULL, updated_at ${date} NOT NULL, ip_address TEXT, user_agent TEXT, user_id ${id} NOT NULL)`,
		`CREATE TABLE verification (id ${id} PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at ${date} NOT NULL, created_at ${date} NOT NULL, updated_at ${date} NOT NULL)`,
		`CREATE TABLE account (id ${id} PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id ${id} NOT NULL, access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at ${date}, refresh_token_expires_at ${date}, scope TEXT, password TEXT, created_at ${date} NOT NULL, updated_at ${date} NOT NULL)`,
	];
}

function stringDateSuite(
	name: string,
	createAdapter: () => Promise<{
		database: ReturnType<typeof drizzleAdapter>;
		close: () => Promise<void>;
	}>,
) {
	describe(name, async () => {
		const { database, close } = await createAdapter();
		afterAll(close);
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			secret: "better-auth-secret-that-is-long-enough-for-validation-test",
			database,
			emailAndPassword: { enabled: true },
		});

		it("signs up and reads the session dates back unchanged", async () => {
			const before = Date.now();
			const response = await auth.api.signUpEmail({
				body: {
					email: "string-dates@example.com",
					password: "password-123456",
					name: "String Dates",
				},
				asResponse: true,
			});
			expect(response.status).toBe(200);
			const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
			const session = await auth.api.getSession({
				headers: new Headers({ cookie }),
			});

			expect(session).not.toBeNull();
			expect(session!.user.createdAt.getTime()).toBeGreaterThanOrEqual(
				before - 1000,
			);
			expect(session!.user.createdAt.getTime()).toBeLessThanOrEqual(
				Date.now() + 1000,
			);
			const sevenDays = 7 * 24 * 60 * 60 * 1000;
			expect(
				Math.abs(session!.session.expiresAt.getTime() - before - sevenDays),
			).toBeLessThan(60_000);
		});

		it("filters on a date column", async () => {
			const context = await auth.$context;
			const sessions = await context.adapter.findMany({
				model: "session",
				where: [{ field: "expiresAt", operator: "gt", value: new Date() }],
			});
			expect(sessions).toHaveLength(1);
		});
	});
}

/**
 * @see https://github.com/better-auth/better-auth/issues/7419
 */
stringDateSuite(
	'PostgreSQL timestamp({ mode: "string" }) with postgres-js',
	async () => {
		const sql = postgres("postgres://user:password@localhost:5432/better_auth");
		await sql.unsafe("DROP SCHEMA IF EXISTS string_dates CASCADE");
		await sql.unsafe("CREATE SCHEMA string_dates");
		const scoped = postgres(
			"postgres://user:password@localhost:5432/better_auth",
			{
				connection: { search_path: "string_dates" },
			},
		);
		for (const statement of ddl("TEXT", "BOOLEAN", "TIMESTAMP(3)")) {
			await scoped.unsafe(
				statement.replace(/^CREATE TABLE (\w+)/, 'CREATE TABLE "$1"'),
			);
		}
		const schema = pgSchema;
		return {
			database: drizzleAdapter(drizzlePostgresJs(scoped, { schema }), {
				provider: "pg",
				schema,
			}),
			close: async () => {
				await scoped.end();
				await sql.unsafe("DROP SCHEMA string_dates CASCADE");
				await sql.end();
			},
		};
	},
);

/**
 * @see https://github.com/better-auth/better-auth/issues/10816
 */
stringDateSuite("SQLite text() dates with better-sqlite3", async () => {
	const sqlite = new Database(":memory:");
	for (const statement of ddl("TEXT", "INTEGER", "TEXT"))
		sqlite.exec(statement);
	const schema = sqliteSchema;
	return {
		database: drizzleAdapter(drizzleSqlite(sqlite, { schema }), {
			provider: "sqlite",
			schema,
		}),
		close: async () => {
			sqlite.close();
		},
	};
});
