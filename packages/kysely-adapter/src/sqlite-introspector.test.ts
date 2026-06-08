import type { SQLInputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import { Kysely } from "kysely";
import {
	DEFAULT_MIGRATION_LOCK_TABLE as KYSELY_DEFAULT_MIGRATION_LOCK_TABLE,
	DEFAULT_MIGRATION_TABLE as KYSELY_DEFAULT_MIGRATION_TABLE,
} from "kysely/migration";
import { describe, expect, it } from "vitest";
import { BunSqliteDialect } from "./bun-sqlite-dialect";
import {
	DEFAULT_MIGRATION_LOCK_TABLE,
	DEFAULT_MIGRATION_TABLE,
} from "./kysely-migration-tables";
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9810
	 */
	it("hides Kysely's internal migration tables during introspection", async () => {
		const sqlite = new DatabaseSync(":memory:");
		for (const sql of [
			"CREATE TABLE users (id INTEGER PRIMARY KEY)",
			`CREATE TABLE ${DEFAULT_MIGRATION_TABLE} (name TEXT)`,
			`CREATE TABLE ${DEFAULT_MIGRATION_LOCK_TABLE} (id TEXT)`,
		]) {
			sqlite.prepare(sql).run();
		}
		const db = new Kysely({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});

		const names = (await db.introspection.getTables()).map((t) => t.name);
		await db.destroy();

		expect(names).toContain("users");
		expect(names).not.toContain(DEFAULT_MIGRATION_TABLE);
		expect(names).not.toContain(DEFAULT_MIGRATION_LOCK_TABLE);
	});

	/**
	 * Guards against drift: the dialects mirror these constants instead of
	 * importing them, so they must stay equal to Kysely's own values.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/9810
	 */
	it("mirrors Kysely's migration-table constants", () => {
		expect(DEFAULT_MIGRATION_TABLE).toBe(KYSELY_DEFAULT_MIGRATION_TABLE);
		expect(DEFAULT_MIGRATION_LOCK_TABLE).toBe(
			KYSELY_DEFAULT_MIGRATION_LOCK_TABLE,
		);
	});
});
