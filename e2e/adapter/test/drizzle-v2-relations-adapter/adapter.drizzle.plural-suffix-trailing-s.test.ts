/**
 * The schema generator only appends a join relation's "s" when the model name
 * does not already end in one ("address" stays "address"), but the adapter
 * appended "s" unconditionally, producing a key with a doubled trailing "s".
 * That key is absent from the relations, so the join crashes. The adapter now
 * mirrors the generator's trailing-"s" rule and renames the result back to the
 * model name directly.
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

// Model name ends in "s", so the generator keeps the relation key as "address"
// rather than pluralizing it to a key with a doubled trailing "s".
const address = sqliteTable("address", {
	id: text("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => users.id),
	city: text("city").notNull(),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

const tables = { user: users, address };
const relations = defineRelationsPart(tables, (r) => ({
	user: {
		address: r.many.address({ from: r.user.id, to: r.address.userId }),
	},
	address: {
		user: r.one.user({ from: r.address.userId, to: r.user.id }),
	},
}));

describe("drizzle relations-v2 adapter: join model name ending in 's'", () => {
	const sqliteDb = new Database(":memory:");
	const db = drizzle({ client: sqliteDb, schema: tables, relations });

	const adapter = drizzleAdapter(db, {
		schema: { user: users, address, relations },
		provider: "sqlite",
	})({
		experimental: { joins: true },
		plugins: [
			{
				id: "test-address",
				schema: {
					address: {
						fields: {
							userId: {
								type: "string",
								required: true,
								references: { model: "user", field: "id" },
							},
							city: { type: "string", required: true },
						},
					},
				},
			},
		],
	});

	beforeEach(() => {
		sqliteDb.exec("DROP TABLE IF EXISTS address;");
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
			CREATE TABLE address (
				id TEXT PRIMARY KEY,
				userId TEXT NOT NULL REFERENCES user(id),
				city TEXT NOT NULL,
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
			INSERT INTO address (id, userId, city, createdAt, updatedAt)
			VALUES
				('a1', 'u1', 'Seoul', ${nowTs}, ${nowTs}),
				('a2', 'u1', 'London', ${nowTs}, ${nowTs});
		`);
	});

	afterAll(() => {
		sqliteDb.close();
	});

	it("findOne joins a child model whose name ends in 's'", async () => {
		const result = await adapter.findOne<Record<string, any>>({
			model: "user",
			where: [{ field: "id", value: "u1" }],
			join: { address: true },
		});

		expect(result?.id).toBe("u1");
		expect(
			(result?.address as { id: string }[]).map((a) => a.id).sort(),
		).toEqual(["a1", "a2"]);
	});

	it("findMany joins a child model whose name ends in 's'", async () => {
		const result = await adapter.findMany<Record<string, any>>({
			model: "user",
			where: [{ field: "id", value: "u1" }],
			join: { address: true },
		});

		expect(result).toHaveLength(1);
		expect(
			(result[0]?.address as { id: string }[]).map((a) => a.id).sort(),
		).toEqual(["a1", "a2"]);
	});
});
