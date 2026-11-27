/**
 * Drizzle passes the value of a string-mode timestamp or a SQLite `text()`
 * column to the driver unchanged, so the adapter's `Date` reached
 * postgres-js and better-sqlite3, which reject it. A date read back from a
 * column without a time zone is only wrong when the server is not on UTC, so
 * these tests run in America/Los_Angeles.
 */
import type { User } from "@better-auth/core/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import {
	boolean,
	pgTable,
	text as pgText,
	timestamp,
} from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const originalTZ = process.env.TZ;
beforeAll(() => {
	process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
	// Assigning undefined would store the string "undefined".
	if (originalTZ === undefined) delete process.env.TZ;
	else process.env.TZ = originalTZ;
});

const createdAt = new Date("2026-01-16T16:50:54.888Z");

function stringDateSuite(
	name: string,
	setup: () => Promise<{
		adapter: ReturnType<ReturnType<typeof drizzleAdapter>>;
		storedCreatedAt: () => Promise<string>;
		close: () => Promise<void>;
	}>,
	expectedStoredCreatedAt: string,
) {
	describe(name, async () => {
		const { adapter, storedCreatedAt, close } = await setup();
		afterAll(close);

		it("writes, filters on, updates and reads back a Date", async () => {
			await adapter.create<User>({
				model: "user",
				data: {
					name: "String Dates",
					email: "string-dates@example.com",
					emailVerified: false,
					createdAt,
					updatedAt: createdAt,
				},
			});
			expect(await storedCreatedAt()).toBe(expectedStoredCreatedAt);

			const found = await adapter.findMany<User>({
				model: "user",
				where: [
					{
						field: "createdAt",
						operator: "lt",
						value: new Date("2026-01-17T00:00:00.000Z"),
					},
				],
			});
			expect(found).toHaveLength(1);
			expect(found[0]!.createdAt).toEqual(createdAt);

			const updatedAt = new Date("2026-02-01T00:00:00.000Z");
			const updated = await adapter.update<User>({
				model: "user",
				where: [{ field: "email", value: "string-dates@example.com" }],
				update: { updatedAt },
			});
			expect(updated?.updatedAt).toEqual(updatedAt);
		});
	});
}

/**
 * @see https://github.com/better-auth/better-auth/issues/7419
 */
stringDateSuite(
	'PostgreSQL timestamp({ mode: "string" }) with postgres-js',
	async () => {
		const url = "postgres://user:password@localhost:5432/better_auth";
		const admin = postgres(url);
		await admin.unsafe("DROP SCHEMA IF EXISTS string_dates CASCADE");
		await admin.unsafe("CREATE SCHEMA string_dates");
		const sql = postgres(url, {
			connection: { search_path: "string_dates" },
		});
		await sql.unsafe(
			'CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, "emailVerified" BOOLEAN NOT NULL, image TEXT, "createdAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL)',
		);
		const date = (name: string) =>
			timestamp(name, { mode: "string", precision: 3 });
		const user = pgTable("user", {
			id: pgText("id").primaryKey(),
			name: pgText("name").notNull(),
			email: pgText("email").notNull(),
			emailVerified: boolean("emailVerified").notNull(),
			image: pgText("image"),
			createdAt: date("createdAt").notNull(),
			updatedAt: date("updatedAt").notNull(),
		});
		return {
			adapter: drizzleAdapter(drizzlePostgresJs(sql, { schema: { user } }), {
				provider: "pg",
				schema: { user },
			})({}),
			storedCreatedAt: async () =>
				(await sql.unsafe('SELECT "createdAt"::text AS value FROM "user"'))[0]!
					.value,
			close: async () => {
				await sql.end();
				await admin.unsafe("DROP SCHEMA string_dates CASCADE");
				await admin.end();
			},
		};
	},
	"2026-01-16 16:50:54.888",
);

/**
 * @see https://github.com/better-auth/better-auth/issues/10816
 */
stringDateSuite(
	"SQLite text() dates with better-sqlite3",
	async () => {
		const sqlite = new Database(":memory:");
		sqlite.exec(
			"CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, emailVerified INTEGER NOT NULL, image TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)",
		);
		const user = sqliteTable("user", {
			id: text("id").primaryKey(),
			name: text("name").notNull(),
			email: text("email").notNull(),
			emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
			image: text("image"),
			createdAt: text("createdAt").notNull(),
			updatedAt: text("updatedAt").notNull(),
		});
		return {
			adapter: drizzleAdapter(drizzleSqlite(sqlite, { schema: { user } }), {
				provider: "sqlite",
				schema: { user },
			})({}),
			storedCreatedAt: async () =>
				(
					sqlite.prepare("SELECT createdAt AS value FROM user").get() as {
						value: string;
					}
				).value,
			close: async () => {
				sqlite.close();
			},
		};
	},
	"2026-01-16T16:50:54.888Z",
);
