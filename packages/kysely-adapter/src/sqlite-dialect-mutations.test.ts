import type { SQLInputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import type { Generated } from "kysely";
import { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { BunSqliteDialect } from "./bun-sqlite-dialect";
import { NodeSqliteDialect } from "./node-sqlite-dialect";

interface UsersTable {
	id: Generated<number>;
	name: string;
	value: string;
}

interface TestDatabase {
	users: UsersTable;
}

function createSchema(db: DatabaseSync) {
	db.prepare(
		"CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, value TEXT)",
	).run();
}

/**
 * Minimal stand-in for a `bun:sqlite` `Database`. The Vitest runner cannot
 * import `bun:sqlite`, so the prepared-statement surface that
 * `BunSqliteConnection` relies on is reproduced on top of `node:sqlite`:
 * `columnNames` distinguishes row-producing statements, `all(params)` binds an
 * array, and `run(...params)` returns Bun's `{ changes, lastInsertRowid }`
 * change metadata.
 */
function asBunLikeDatabase(db: DatabaseSync) {
	return {
		prepare(sql: string) {
			const stmt = db.prepare(sql);
			return {
				get columnNames() {
					return stmt.columns().map((column) => column.name);
				},
				all(...params: SQLInputValue[]) {
					return stmt.all(...params);
				},
				run(...params: SQLInputValue[]) {
					return stmt.run(...params);
				},
			};
		},
		close() {
			db.close();
		},
	} as unknown as ConstructorParameters<typeof BunSqliteDialect>[0]["database"];
}

describe("NodeSqliteDialect mutation metadata", () => {
	it("binds multiple parameters and surfaces insert/update/delete metadata", async () => {
		const sqlite = new DatabaseSync(":memory:");
		createSchema(sqlite);
		const db = new Kysely<TestDatabase>({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});

		const insert = await db
			.insertInto("users")
			.values({ name: "alice", value: "first" })
			.executeTakeFirst();
		expect(insert.numInsertedOrUpdatedRows).toBe(1n);
		expect(insert.insertId).toBe(1n);

		// A multi-parameter predicate must still bind correctly.
		const found = await db
			.selectFrom("users")
			.selectAll()
			.where("name", "=", "alice")
			.where("value", "=", "first")
			.executeTakeFirst();
		expect(found?.name).toBe("alice");

		const update = await db
			.updateTable("users")
			.set({ value: "second" })
			.where("name", "=", "alice")
			.executeTakeFirst();
		expect(update.numUpdatedRows).toBe(1n);

		const remove = await db
			.deleteFrom("users")
			.where("name", "=", "alice")
			.executeTakeFirst();
		expect(remove.numDeletedRows).toBe(1n);

		await db.destroy();
	});

	it("keeps row results for RETURNING mutations", async () => {
		const sqlite = new DatabaseSync(":memory:");
		createSchema(sqlite);
		const db = new Kysely<TestDatabase>({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});

		const inserted = await db
			.insertInto("users")
			.values({ name: "bob", value: "x" })
			.returningAll()
			.executeTakeFirst();
		expect(inserted?.name).toBe("bob");

		await db.destroy();
	});
});

describe("BunSqliteDialect mutation metadata", () => {
	it("binds multiple parameters and surfaces insert/update/delete metadata", async () => {
		const sqlite = new DatabaseSync(":memory:");
		createSchema(sqlite);
		const db = new Kysely<TestDatabase>({
			dialect: new BunSqliteDialect({ database: asBunLikeDatabase(sqlite) }),
		});

		const insert = await db
			.insertInto("users")
			.values({ name: "alice", value: "first" })
			.executeTakeFirst();
		expect(insert.numInsertedOrUpdatedRows).toBe(1n);
		expect(insert.insertId).toBe(1n);

		const found = await db
			.selectFrom("users")
			.selectAll()
			.where("name", "=", "alice")
			.where("value", "=", "first")
			.executeTakeFirst();
		expect(found?.name).toBe("alice");

		const update = await db
			.updateTable("users")
			.set({ value: "second" })
			.where("name", "=", "alice")
			.executeTakeFirst();
		expect(update.numUpdatedRows).toBe(1n);

		const remove = await db
			.deleteFrom("users")
			.where("name", "=", "alice")
			.executeTakeFirst();
		expect(remove.numDeletedRows).toBe(1n);

		await db.destroy();
	});

	it("keeps row results for RETURNING mutations", async () => {
		const sqlite = new DatabaseSync(":memory:");
		createSchema(sqlite);
		const db = new Kysely<TestDatabase>({
			dialect: new BunSqliteDialect({ database: asBunLikeDatabase(sqlite) }),
		});

		const inserted = await db
			.insertInto("users")
			.values({ name: "bob", value: "x" })
			.returningAll()
			.executeTakeFirst();
		expect(inserted?.name).toBe("bob");

		await db.destroy();
	});
});
