import { DatabaseSync } from "node:sqlite";
import { Kysely, SqliteDialect } from "kysely";
import { describe, expect, it } from "vitest";
import { D1SqliteDialect } from "./d1-sqlite-dialect";
import { createKyselyAdapter } from "./dialect";
import { kyselyAdapter } from "./kysely-adapter";

describe("kysely-adapter", () => {
	class UnknownDialect {
		createAdapter() {
			return {
				supportsTransactionalDdl: () => false,
				supportsReturning: false,
				supportsCreateIfNotExists: true,
				supportsOutput: false,
				acquireMigrationLock: async () => {},
				releaseMigrationLock: async () => {},
			};
		}

		createDriver() {
			return {
				async init() {},
				async acquireConnection() {
					return {
						async executeQuery() {
							return { rows: [] };
						},
						async *streamQuery() {},
					};
				},
				async beginTransaction() {},
				async commitTransaction() {},
				async rollbackTransaction() {},
				async releaseConnection() {},
				async destroy() {},
			};
		}

		createIntrospector(db: Kysely<any>) {
			return db.introspection;
		}

		createQueryCompiler() {
			return {
				compileQuery() {
					return { sql: "", parameters: [] };
				},
			};
		}
	}

	it("should create kysely adapter", () => {
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: {
					close: () => {},
					prepare: () =>
						({
							all: () => [],
							run: () => {},
							get: () => {},
							iterate: () => [],
						}) as any,
				} as any,
			}),
		});
		const adapter = kyselyAdapter(db);
		expect(adapter).toBeDefined();
	});

	it("should enable transactions by default for node:sqlite databases", async () => {
		const sqlite = new DatabaseSync(":memory:");
		const adapter = await createKyselyAdapter({
			database: sqlite,
		} as never);

		expect(adapter.transaction).toBe(true);
	});

	it("should enable transactions by default for Kysely sqlite instances", async () => {
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new DatabaseSync(":memory:"),
			}),
		});

		const adapter = await createKyselyAdapter({
			database: {
				db,
				type: "sqlite",
			},
		} as never);

		expect(adapter.transaction).toBe(true);
	});

	it("should respect an explicit transaction opt-out", async () => {
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new DatabaseSync(":memory:"),
			}),
		});

		const adapter = await createKyselyAdapter({
			database: {
				db,
				type: "sqlite",
				transaction: false,
			},
		} as never);

		expect(adapter.transaction).toBe(false);
	});

	it("should keep transactions disabled for D1 databases", async () => {
		const adapter = await createKyselyAdapter({
			database: {
				batch: async () => [],
				exec: async () => ({ count: 0, duration: 0 }),
				prepare: () => ({
					bind: () => ({
						all: async () => ({
							results: [],
							success: true,
							meta: { duration: 0 },
						}),
						first: async () => null,
						run: async () => ({
							success: true,
							meta: {
								duration: 0,
								changes: 0,
								last_row_id: 0,
								rows_read: 0,
								rows_written: 0,
								size_after: 0,
							},
						}),
						raw: async () => [],
					}),
				}),
			},
		} as never);

		expect(adapter.transaction).toBe(false);
	});

	it("should keep transactions disabled for D1 dialect instances", async () => {
		const d1Database = {
			batch: async () => [],
			exec: async () => ({ count: 0, duration: 0 }),
			prepare: () => ({
				bind: () => ({
					all: async () => ({
						results: [],
						success: true,
						meta: { duration: 0 },
					}),
					first: async () => null,
					run: async () => ({
						success: true,
						meta: {
							duration: 0,
							changes: 0,
							last_row_id: 0,
							rows_read: 0,
							rows_written: 0,
							size_after: 0,
						},
					}),
					raw: async () => [],
				}),
			}),
		};

		const adapter = await createKyselyAdapter({
			database: {
				dialect: new D1SqliteDialect({
					database: d1Database as never,
				}),
				type: "sqlite",
			},
		} as never);

		expect(adapter.transaction).toBe(false);
	});

	it("should not infer transactions for unknown custom dialects", async () => {
		const adapter = await createKyselyAdapter({
			database: {
				dialect: new UnknownDialect() as never,
				type: "sqlite",
			},
		} as never);

		expect(adapter.transaction).toBeUndefined();
	});
});
