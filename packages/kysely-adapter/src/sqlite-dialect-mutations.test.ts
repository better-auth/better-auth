import type { SQLInputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "@better-auth/core";
import type { Dialect, Generated } from "kysely";
import { CompiledQuery, Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { BunSqliteDialect } from "./bun-sqlite-dialect";
import { createKyselyAdapter } from "./dialect";
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

async function expectNoStaleInsertIdForUpdateOrDelete(dialect: Dialect) {
	const driver = dialect.createDriver();
	await driver.init();
	const connection = await driver.acquireConnection();

	try {
		await connection.executeQuery(
			CompiledQuery.raw(
				"CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, value TEXT)",
			),
		);
		const insert = await connection.executeQuery(
			CompiledQuery.raw(
				"INSERT INTO users (name, value) VALUES ('alice', 'first')",
			),
		);
		expect(insert.insertId).toBe(1n);

		const update = await connection.executeQuery(
			CompiledQuery.raw(
				"UPDATE users SET value = 'second' WHERE name = 'alice'",
			),
		);
		expect(update.numAffectedRows).toBe(1n);
		expect(update.insertId).toBeUndefined();

		const remove = await connection.executeQuery(
			CompiledQuery.raw("DELETE FROM users WHERE name = 'alice'"),
		);
		expect(remove.numAffectedRows).toBe(1n);
		expect(remove.insertId).toBeUndefined();
	} finally {
		await driver.releaseConnection(connection);
		await driver.destroy();
	}
}

describe("NodeSqliteDialect mutation metadata", () => {
	it("enables real transactions for direct node:sqlite databases", async () => {
		const sqlite = new DatabaseSync(":memory:");
		const adapter = await createKyselyAdapter({
			database: sqlite,
		} satisfies BetterAuthOptions);

		expect(adapter.transaction).toBe(true);
		await adapter.kysely?.destroy();
	});

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

	it("does not report stale insertId for update and delete", async () => {
		await expectNoStaleInsertIdForUpdateOrDelete(
			new NodeSqliteDialect({ database: new DatabaseSync(":memory:") }),
		);
	});
});

describe("D1SqliteDialect transaction metadata", () => {
	it("keeps interactive transactions disabled for D1", async () => {
		const d1LikeDatabase = {
			batch() {
				return Promise.resolve([]);
			},
			exec() {
				return Promise.resolve();
			},
			prepare() {
				return {
					bind() {
						return {
							all() {
								return Promise.resolve({
									results: [],
									meta: {},
								});
							},
						};
					},
				};
			},
		} as unknown as BetterAuthOptions["database"];
		const adapter = await createKyselyAdapter({
			database: d1LikeDatabase,
		} satisfies BetterAuthOptions);

		expect(adapter.transaction).toBe(false);
		await adapter.kysely?.destroy();
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

	it("does not report stale insertId for update and delete", async () => {
		await expectNoStaleInsertIdForUpdateOrDelete(
			new BunSqliteDialect({
				database: asBunLikeDatabase(new DatabaseSync(":memory:")),
			}),
		);
	});
});
