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
import { describe, expect, it, vi } from "vitest";
import { createD1IndexIntrospector } from "./d1-sqlite-dialect";
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
