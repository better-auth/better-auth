import type { SQLInputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { BunSqliteDialect } from "./bun-sqlite-dialect";
import { NodeSqliteDialect } from "./node-sqlite-dialect";

function createSchema(db: DatabaseSync) {
	for (const sql of [
		"CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT)",
		"CREATE TABLE sessions (id INTEGER PRIMARY KEY, token TEXT)",
		"CREATE VIEW active_accounts AS SELECT * FROM accounts",
	]) {
		db.prepare(sql).run();
	}
}

function asBunLikeDatabase(db: DatabaseSync) {
	return {
		prepare(sql: string) {
			const stmt = db.prepare(sql);
			return {
				all(params: SQLInputValue[]) {
					return stmt.all(...(params ?? []));
				},
			};
		},
		close() {
			db.close();
		},
	} as unknown as ConstructorParameters<typeof BunSqliteDialect>[0]["database"];
}

describe("sqlite introspector", () => {
	it("NodeSqliteDialect reports tables as non-views", async () => {
		const sqlite = new DatabaseSync(":memory:");
		createSchema(sqlite);
		const db = new Kysely({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});

		const tables = await db.introspection.getTables();
		await db.destroy();

		expect(tables.length).toBeGreaterThan(0);
		for (const table of tables) {
			expect(table.isView).toBe(false);
		}
	});

	it("BunSqliteDialect reports tables as non-views", async () => {
		const sqlite = new DatabaseSync(":memory:");
		createSchema(sqlite);
		const db = new Kysely({
			dialect: new BunSqliteDialect({ database: asBunLikeDatabase(sqlite) }),
		});

		const tables = await db.introspection.getTables();
		await db.destroy();

		expect(tables.length).toBeGreaterThan(0);
		for (const table of tables) {
			expect(table.isView).toBe(false);
		}
	});
});
