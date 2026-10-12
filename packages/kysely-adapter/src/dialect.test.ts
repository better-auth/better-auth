import { DatabaseSync } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import type {
	DatabaseIntrospector,
	Dialect,
	DialectAdapter,
	Driver,
	Kysely as KyselyInstance,
	QueryCompiler,
} from "kysely";
import {
	Kysely,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
} from "kysely";
import { describe, expect, it, vi } from "vitest";
import {
	createD1IndexIntrospector,
	D1SqliteDialect,
} from "./d1-sqlite-dialect";
import { createKyselyAdapter } from "./dialect";

class StubDriver implements Driver {
	async init(): Promise<void> {}
	async acquireConnection(): Promise<never> {
		throw new Error("not implemented");
	}
	async beginTransaction(): Promise<void> {}
	async commitTransaction(): Promise<void> {}
	async rollbackTransaction(): Promise<void> {}
	async releaseConnection(): Promise<void> {}
	async destroy(): Promise<void> {}
}

class UnknownDialect implements Dialect {
	createDriver(): Driver {
		return new StubDriver();
	}
	createQueryCompiler(): QueryCompiler {
		return {} as QueryCompiler;
	}
	createAdapter(): DialectAdapter {
		return {} as DialectAdapter;
	}
	createIntrospector(): DatabaseIntrospector {
		return {} as DatabaseIntrospector;
	}
}

function postgresDialect(): Dialect {
	return {
		createAdapter: () => new PostgresAdapter(),
		createDriver: () => new StubDriver(),
		createIntrospector: (db: KyselyInstance<unknown>) =>
			new PostgresIntrospector(db),
		createQueryCompiler: () => new PostgresQueryCompiler(),
	};
}

function fakeD1Database() {
	return {
		batch: () => Promise.resolve([]),
		exec: () => Promise.resolve({}),
		prepare: () => ({}),
	} as unknown as D1Database;
}

describe("createKyselyAdapter transaction detection", () => {
	it("reports native transaction support for a raw node:sqlite database", async () => {
		const sqlite = new DatabaseSync(":memory:");
		const { transaction, databaseType } = await createKyselyAdapter({
			database: sqlite,
		});
		expect(transaction).toBe(true);
		expect(databaseType).toBe("sqlite");
	});

	it("does not report native transaction support for a Cloudflare D1 database", async () => {
		const { transaction, databaseType, introspectIndexes } =
			await createKyselyAdapter({
				database: fakeD1Database(),
			});
		expect(transaction).toBe(false);
		expect(databaseType).toBe("sqlite");
		expect(introspectIndexes).toBeTypeOf("function");
	});

	it("leaves transaction support unspecified for a caller-supplied dialect of unknown capability", async () => {
		const { transaction, databaseType } = await createKyselyAdapter({
			database: new UnknownDialect(),
		});
		expect(transaction).toBeUndefined();
		expect(databaseType).toBeNull();
	});

	it("still honors an explicit transaction: false override on a { db } config", async () => {
		const fakeKysely = {} as unknown as KyselyInstance<any>;
		const { transaction } = await createKyselyAdapter({
			database: {
				db: fakeKysely,
				type: "sqlite",
				transaction: false,
			},
		});
		expect(transaction).toBe(false);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10551
 */
describe("D1 index introspection", () => {
	it("batches queries and returns normalized index metadata", async () => {
		const prepare = vi.fn((query: string) => ({ query }));
		const batch = vi
			.fn()
			.mockResolvedValueOnce([
				{
					results: [
						{
							name: "users'archive_email_name_idx",
							partial: 0,
							unique: 1,
						},
						{
							name: "users'archive_expression_idx",
							partial: 1,
							unique: 0,
						},
					],
				},
			])
			.mockResolvedValueOnce([
				{
					results: [
						{ name: "email", seqno: 0 },
						{ name: "name", seqno: 1 },
					],
				},
				{ results: [{ name: null, seqno: 0 }] },
			]);
		const database = {
			batch,
			exec: vi.fn(),
			prepare,
		} as unknown as D1Database;

		const indexes = await createD1IndexIntrospector(database)([
			"users'archive",
		]);

		expect(batch).toHaveBeenCalledTimes(2);
		expect(prepare.mock.calls.map(([query]) => query)).toEqual([
			"PRAGMA index_list('users''archive')",
			"PRAGMA index_info('users''archive_email_name_idx')",
			"PRAGMA index_info('users''archive_expression_idx')",
		]);
		expect(indexes).toEqual([
			{
				columns: [
					{ fullLength: true, name: "email", position: 0 },
					{ fullLength: true, name: "name", position: 1 },
				],
				name: "users'archive_email_name_idx",
				partial: false,
				table: "users'archive",
				unique: true,
				valid: true,
			},
			{
				columns: [{ fullLength: false, name: null, position: 0 }],
				name: "users'archive_expression_idx",
				partial: true,
				table: "users'archive",
				unique: false,
				valid: true,
			},
		]);
	});
});

/** @see https://developers.cloudflare.com/d1/worker-api/d1-database/#batch */
describe("D1 table introspection", () => {
	it("batches column metadata for all tables", async ({ onTestFinished }) => {
		const all = vi.fn(async () => ({
			results: ["user", "session"].map((name) => ({
				name,
				sql: `CREATE TABLE "${name}" ("id" text PRIMARY KEY)`,
				type: "table",
			})),
			meta: { changes: 0, last_row_id: 0 },
		}));
		const prepare = vi.fn((query: string) => ({
			bind: (tableName?: string) => ({ query, tableName, all }),
		}));
		const batch = vi.fn(async (statements: { tableName?: string }[]) =>
			statements.map(({ tableName }) => ({
				results: [
					{
						cid: 0,
						name: `${tableName}_id`,
						type: "text",
						notnull: 0,
						dflt_value: null,
						pk: 1,
					},
				],
			})),
		);
		const database = {
			batch,
			exec: vi.fn(),
			prepare,
		} as unknown as D1Database;
		const db = new Kysely<unknown>({
			dialect: new D1SqliteDialect({ database }),
		});
		onTestFinished(() => db.destroy());

		const tables = await db.introspection.getTables();

		expect(tables.map((table) => table.name)).toEqual(["user", "session"]);
		expect(
			tables.map((table) => table.columns.map((column) => column.name)),
		).toEqual([["user_id"], ["session_id"]]);
		expect(all).toHaveBeenCalledTimes(1);
		expect(batch).toHaveBeenCalledTimes(1);
		expect(batch.mock.calls[0]?.[0].map(({ tableName }) => tableName)).toEqual([
			"user",
			"session",
		]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10551
	 * @see https://www.sqlite.org/pragma.html#pragma_index_list
	 */
	it("checks primary-key indexes only for INTEGER PRIMARY KEY candidates", async ({
		onTestFinished,
	}) => {
		const all = vi.fn(async () => ({
			results: ["plain's", "descending", "text"].map((name) => ({
				name,
				type: "table",
			})),
			meta: { changes: 0, last_row_id: 0 },
		}));
		const prepare = vi.fn((query: string) => ({
			query,
			bind: (tableName?: string) => ({ query, tableName, all }),
		}));
		const batch = vi
			.fn()
			.mockResolvedValueOnce(
				["plain's", "descending", "text"].map((name) => ({
					results: [
						{
							cid: 0,
							name: "id",
							type: name === "text" ? "TEXT" : "INTEGER",
							notnull: 0,
							dflt_value: null,
							pk: 1,
						},
					],
				})),
			)
			.mockResolvedValueOnce([
				{ results: [] },
				{ results: [{ origin: "pk" }] },
			]);
		const database = {
			batch,
			exec: vi.fn(),
			prepare,
		} as unknown as D1Database;
		const db = new Kysely<unknown>({
			dialect: new D1SqliteDialect({ database }),
		});
		onTestFinished(() => db.destroy());

		const tables = await db.introspection.getTables();

		expect(
			tables.map((table) => [table.name, table.columns[0]?.isAutoIncrementing]),
		).toEqual([
			["plain's", true],
			["descending", false],
			["text", false],
		]);
		expect(batch).toHaveBeenCalledTimes(2);
		expect(
			batch.mock.calls[1]?.[0].map(
				(statement: { query: string }) => statement.query,
			),
		).toEqual([
			"PRAGMA index_list('plain''s')",
			"PRAGMA index_list('descending')",
		]);
	});
});

describe("createKyselyAdapter schema namespace", () => {
	it("qualifies every statement with the configured PostgreSQL schema", async () => {
		const { kysely, schemaName } = await createKyselyAdapter({
			database: {
				dialect: postgresDialect(),
				schemaName: "auth",
				type: "postgres",
			},
		});

		expect(schemaName).toBe("auth");
		expect(kysely!.selectFrom("user").select("id").compile().sql).toBe(
			'select "id" from "auth"."user"',
		);
	});

	it("preserves a dotted schema name as one PostgreSQL identifier", async () => {
		const { kysely } = await createKyselyAdapter({
			database: {
				dialect: postgresDialect(),
				schemaName: "tenant.auth",
				type: "postgres",
			},
		});

		expect(kysely!.selectFrom("user").select("id").compile().sql).toBe(
			'select "id" from "tenant.auth"."user"',
		);
	});

	it("leaves statements unqualified when no schema is configured", async () => {
		const { kysely, schemaName } = await createKyselyAdapter({
			database: { dialect: postgresDialect(), type: "postgres" },
		});

		expect(schemaName).toBeUndefined();
		expect(kysely!.selectFrom("user").select("id").compile().sql).toBe(
			'select "id" from "user"',
		);
	});

	it("qualifies statements for a caller-supplied Kysely instance", async () => {
		const db = new Kysely<Record<string, never>>({
			dialect: postgresDialect(),
		});

		const { kysely } = await createKyselyAdapter({
			database: { db, schemaName: "auth", type: "postgres" },
		});

		expect(kysely!.selectFrom("user").select("id").compile().sql).toBe(
			'select "id" from "auth"."user"',
		);
	});

	it("refuses a schema on a dialect that does not support it", async () => {
		await expect(
			createKyselyAdapter({
				database: {
					dialect: postgresDialect(),
					schemaName: "auth",
					type: "mysql",
				},
			}),
		).rejects.toThrow(
			'`database.schemaName` is only supported on PostgreSQL, but the configured database type is "mysql".',
		);
	});

	it("refuses an empty schema name", async () => {
		await expect(
			createKyselyAdapter({
				database: {
					dialect: postgresDialect(),
					schemaName: "",
					type: "postgres",
				},
			}),
		).rejects.toThrow("`database.schemaName` must be a non-empty schema name.");
	});
});
