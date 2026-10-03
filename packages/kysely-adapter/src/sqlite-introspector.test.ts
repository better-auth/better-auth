import type { SQLInputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import { Kysely } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { BunSqliteDialect } from "./bun-sqlite-dialect";
import {
	DEFAULT_MIGRATION_LOCK_TABLE,
	DEFAULT_MIGRATION_TABLE,
} from "./kysely-migration-tables";
import { NodeSqliteDialect } from "./node-sqlite-dialect";
import { introspectSqliteTables } from "./sqlite-introspector";

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

interface KyselyMigrationTableConstants {
	DEFAULT_MIGRATION_LOCK_TABLE: string;
	DEFAULT_MIGRATION_TABLE: string;
}

function getErrorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return undefined;
	}

	const code = error.code;
	return typeof code === "string" ? code : undefined;
}

function isMissingKyselyMigrationModule(
	error: unknown,
	moduleName: string,
): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const code = getErrorCode(error);
	if (code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
		return true;
	}

	if (
		(error.message.includes('Missing "./migration" specifier') &&
			error.message.includes('"kysely" package')) ||
		(error.message.includes('"./migration" is not exported') &&
			error.message.includes("kysely"))
	) {
		return true;
	}

	return (
		(code === "ERR_MODULE_NOT_FOUND" ||
			code === "MODULE_NOT_FOUND" ||
			error.message.includes("Cannot find module") ||
			error.message.includes("Failed to resolve import") ||
			error.message.includes("Could not resolve")) &&
		error.message.includes(moduleName)
	);
}

async function loadKyselyMigrationTableConstants(): Promise<KyselyMigrationTableConstants> {
	const migrationModule = "kysely/migration";

	try {
		return (await import(
			migrationModule
		)) as unknown as KyselyMigrationTableConstants;
	} catch (error) {
		if (!isMissingKyselyMigrationModule(error, migrationModule)) {
			throw error;
		}

		return (await import("kysely")) as unknown as KyselyMigrationTableConstants;
	}
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
	 * @see https://github.com/better-auth/better-auth/issues/10366
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

	it("mirrors Kysely's migration-table constants", async () => {
		const {
			DEFAULT_MIGRATION_LOCK_TABLE: KYSELY_DEFAULT_MIGRATION_LOCK_TABLE,
			DEFAULT_MIGRATION_TABLE: KYSELY_DEFAULT_MIGRATION_TABLE,
		} = await loadKyselyMigrationTableConstants();

		expect(DEFAULT_MIGRATION_TABLE).toBe(KYSELY_DEFAULT_MIGRATION_TABLE);
		expect(DEFAULT_MIGRATION_LOCK_TABLE).toBe(
			KYSELY_DEFAULT_MIGRATION_LOCK_TABLE,
		);
	});
});

/**
 * @see https://www.sqlite.org/autoinc.html
 * @see https://www.sqlite.org/lang_createtable.html#rowids_and_the_integer_primary_key
 */
describe("SQLite generated primary keys", () => {
	it.for([
		{
			name: "an explicit AUTOINCREMENT declaration after whitespace",
			definition: `CREATE TABLE entries (
				seq INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
				id TEXT NOT NULL UNIQUE
			)`,
			generated: "seq",
		},
		{
			name: "an AUTOINCREMENT declaration separated by a comment",
			definition:
				"CREATE TABLE entries (seq INTEGER PRIMARY KEY/**/AUTOINCREMENT, id TEXT)",
			generated: "seq",
		},
		{
			name: "an INTEGER PRIMARY KEY without AUTOINCREMENT",
			definition: "CREATE TABLE entries (seq INTEGER PRIMARY KEY, id TEXT)",
			generated: "seq",
		},
		{
			name: "a quoted primary key identifier",
			definition:
				'CREATE TABLE entries ("sequence number" INTEGER PRIMARY KEY, id TEXT)',
			generated: "sequence number",
		},
		{
			name: "AUTOINCREMENT inside a default string",
			definition:
				"CREATE TABLE entries (ref INTEGER PRIMARY KEY,note TEXT DEFAULT 'use AUTOINCREMENT')",
			generated: "ref",
		},
		{
			name: "AUTOINCREMENT inside a default string on a WITHOUT ROWID table",
			definition:
				"CREATE TABLE entries (ref INTEGER PRIMARY KEY, note TEXT DEFAULT 'use AUTOINCREMENT') WITHOUT ROWID",
			generated: undefined,
		},
		{
			name: "an INTEGER PRIMARY KEY DESC column",
			definition:
				"CREATE TABLE entries (seq INTEGER PRIMARY KEY DESC, id TEXT)",
			generated: undefined,
		},
		{
			name: "a table-level PRIMARY KEY with DESC ordering",
			definition:
				"CREATE TABLE entries (seq INTEGER, id TEXT, PRIMARY KEY (seq DESC))",
			generated: "seq",
		},
		{
			name: "an INTEGER PRIMARY KEY on a WITHOUT ROWID table",
			definition:
				"CREATE TABLE entries (seq INTEGER PRIMARY KEY, id TEXT) WITHOUT ROWID",
			generated: undefined,
		},
		{
			name: "an INT PRIMARY KEY column",
			definition: "CREATE TABLE entries (seq INT PRIMARY KEY, id TEXT)",
			generated: undefined,
		},
	])("recognizes $name", async ({ definition, generated }, {
		onTestFinished,
	}) => {
		const sqlite = new DatabaseSync(":memory:");
		sqlite.exec(definition);
		const db = new Kysely({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});
		onTestFinished(() => db.destroy());

		const tables = await db.introspection.getTables();
		const entries = tables.find((table) => table.name === "entries");
		expect(
			entries?.columns
				.filter((column) => column.isAutoIncrementing)
				.map((column) => column.name),
		).toEqual(generated ? [generated] : []);
	});

	it("BunSqliteDialect recognizes an INTEGER PRIMARY KEY", async ({
		onTestFinished,
	}) => {
		const sqlite = new DatabaseSync(":memory:");
		sqlite.exec("CREATE TABLE entries (id INTEGER PRIMARY KEY, name TEXT)");
		const db = new Kysely({
			dialect: new BunSqliteDialect({ database: asBunLikeDatabase(sqlite) }),
		});
		onTestFinished(() => db.destroy());

		const tables = await db.introspection.getTables();
		const id = tables.find((table) => table.name === "entries")?.columns[0];
		expect(id?.isAutoIncrementing).toBe(true);
	});

	/** @see https://github.com/better-auth/better-auth/issues/10551 */
	it("uses statement-form PRAGMA when dialect introspection is unavailable", async ({
		onTestFinished,
	}) => {
		const sqlite = new DatabaseSync(":memory:");
		const generatedName = 'generated"name';
		sqlite.exec('CREATE TABLE "generated""name" (id INTEGER PRIMARY KEY)');
		sqlite.exec("CREATE TABLE descending (id INTEGER PRIMARY KEY DESC)");
		const prepare = vi.spyOn(sqlite, "prepare");
		const dialect = new NodeSqliteDialect({ database: sqlite });
		vi.spyOn(dialect, "createIntrospector").mockReturnValue({
			getMetadata: async () => {
				throw new Error("introspection unavailable");
			},
			getSchemas: async () => [],
			getTables: async () => {
				throw new Error("introspection unavailable");
			},
		});
		const db = new Kysely({ dialect });
		onTestFinished(() => db.destroy());

		const tables = await introspectSqliteTables(db, [
			generatedName,
			"descending",
		]);
		expect(
			tables.map((table) => [table.name, table.columns[0]?.isAutoIncrementing]),
		).toEqual([
			[generatedName, true],
			["descending", false],
		]);
		const indexQueries = prepare.mock.calls
			.map(([query]) => query.trim())
			.filter((query) => query.includes("index_list"));
		expect(indexQueries).toHaveLength(2);
		expect(indexQueries).toEqual(
			expect.arrayContaining([
				'PRAGMA index_list("generated""name")',
				'PRAGMA index_list("descending")',
			]),
		);
	});
});
