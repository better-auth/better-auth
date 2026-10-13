/**
 * SQLite has no date column, and Drizzle's `text()` passes the value to the
 * driver unchanged, so a `Date` reached better-sqlite3 and the write failed.
 *
 * @see https://github.com/better-auth/better-auth/issues/10816
 */
import type { User } from "@better-auth/core/db";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A date read back without a time zone is only wrong off UTC.
const originalTZ = process.env.TZ;
beforeAll(() => {
	process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
	// Assigning undefined would store the string "undefined".
	if (originalTZ === undefined) delete process.env.TZ;
	else process.env.TZ = originalTZ;
});

const users = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: text("createdAt").notNull(),
	updatedAt: text("updatedAt").notNull(),
});

describe("drizzle relations-v2 adapter: SQLite text() date columns", () => {
	const sqliteDb = new Database(":memory:");
	sqliteDb.exec(
		"CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, emailVerified INTEGER NOT NULL, image TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)",
	);
	const adapter = drizzleAdapter(
		drizzle({ client: sqliteDb, schema: { users } }),
		{ schema: { user: users }, provider: "sqlite" },
	)({});
	const createdAt = new Date("2026-01-16T16:50:54.888Z");

	it("writes, filters on, and reads back a Date", async () => {
		await adapter.create<User>({
			model: "user",
			data: {
				name: "Text Dates",
				email: "text-dates@example.com",
				emailVerified: false,
				createdAt,
				updatedAt: createdAt,
			},
		});
		expect(sqliteDb.prepare("SELECT createdAt FROM user").get()).toEqual({
			createdAt: "2026-01-16T16:50:54.888Z",
		});

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
			where: [{ field: "email", value: "text-dates@example.com" }],
			update: { updatedAt },
		});
		expect(updated?.updatedAt).toEqual(updatedAt);
	});

	it("reads a date-time without a time zone as UTC", async () => {
		sqliteDb.exec(
			"INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('naive', 'Naive', 'naive@example.com', 0, '2026-01-16 16:50:54.888', '2026-01-16 16:50:54.888')",
		);
		const user = await adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", value: "naive" }],
		});
		expect(user?.createdAt).toEqual(createdAt);
	});
});
