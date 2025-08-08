import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Kysely, sql } from "kysely";
import { NodeSqliteDialect } from "../../node-sqlite-dialect";
import { kyselyAdapter } from "../../kysely-adapter";
import { runAdapterTest } from "../../../test";
import { getMigrations } from "../../../../db/get-migration";
import type { BetterAuthOptions } from "../../../../types";
import merge from "deepmerge";
import type { DatabaseSync } from "node:sqlite";
const nodeVersion = process.version;
const nodeSqliteSupported = +nodeVersion.split(".")[0].slice(1) >= 22;

describe.runIf(nodeSqliteSupported)("node-sqlite-dialect", async () => {
	let db: DatabaseSync;
	let kysely: Kysely<any>;

	beforeAll(async () => {
		const { DatabaseSync } = await import("node:sqlite");

		db = new DatabaseSync(":memory:");

		kysely = new Kysely({
			dialect: new NodeSqliteDialect({
				database: db,
			}),
		});
	});

	afterAll(async () => {
		await kysely.destroy();
		db.close();
	});

	describe("basic operations", () => {
		it("should create tables", async () => {
			await kysely.schema
				.createTable("test_table")
				.addColumn("id", "integer", (col) => col.primaryKey())
				.addColumn("name", "text", (col) => col.notNull())
				.addColumn("created_at", "timestamp", (col) =>
					col.defaultTo(sql`CURRENT_TIMESTAMP`),
				)
				.execute();

			const tables = await kysely.introspection.getTables();
			const testTable = tables.find((t) => t.name === "test_table");
			expect(testTable).toBeDefined();
			expect(testTable?.columns).toHaveLength(3);
		});

		it("should insert and select data", async () => {
			await kysely
				.insertInto("test_table")
				.values({ id: 1, name: "Test User" })
				.execute();

			const result = await kysely
				.selectFrom("test_table")
				.selectAll()
				.execute();

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				id: 1,
				name: "Test User",
			});
		});

		it("should update data", async () => {
			await kysely
				.updateTable("test_table")
				.set({ name: "Updated User" })
				.where("id", "=", 1)
				.execute();

			const result = await kysely
				.selectFrom("test_table")
				.where("id", "=", 1)
				.selectAll()
				.executeTakeFirst();

			expect(result?.name).toBe("Updated User");
		});

		it("should delete data", async () => {
			await kysely.deleteFrom("test_table").where("id", "=", 1).execute();

			const result = await kysely
				.selectFrom("test_table")
				.selectAll()
				.execute();

			expect(result).toHaveLength(0);
		});

		it("should handle transactions", async () => {
			await kysely.transaction().execute(async (trx) => {
				await trx
					.insertInto("test_table")
					.values({ id: 2, name: "Transaction Test" })
					.execute();

				const result = await trx
					.selectFrom("test_table")
					.where("id", "=", 2)
					.selectAll()
					.executeTakeFirst();

				expect(result?.name).toBe("Transaction Test");
			});

			// Verify the transaction was committed
			const result = await kysely
				.selectFrom("test_table")
				.where("id", "=", 2)
				.selectAll()
				.executeTakeFirst();

			expect(result?.name).toBe("Transaction Test");
		});

		it("should rollback transactions on error", async () => {
			try {
				await kysely.transaction().execute(async (trx) => {
					await trx
						.insertInto("test_table")
						.values({ id: 3, name: "Rollback Test" })
						.execute();

					// Force an error
					throw new Error("Test error");
				});
			} catch (error) {
				// Expected error
			}

			// Verify the transaction was rolled back
			const result = await kysely
				.selectFrom("test_table")
				.where("id", "=", 3)
				.selectAll()
				.executeTakeFirst();

			expect(result).toBeUndefined();
		});
	});

	describe("introspection", () => {
		beforeAll(async () => {
			// Create a table with various column types
			await kysely.schema
				.createTable("introspection_test")
				.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
				.addColumn("name", "text", (col) => col.notNull())
				.addColumn("email", "text", (col) => col.unique())
				.addColumn("age", "integer")
				.addColumn("is_active", "boolean", (col) => col.defaultTo(true))
				.execute();
		});

		it("should get table metadata", async () => {
			const tables = await kysely.introspection.getTables();
			const table = tables.find((t) => t.name === "introspection_test");

			expect(table).toBeDefined();
			expect(table?.columns).toHaveLength(5);

			const idColumn = table?.columns.find((c) => c.name === "id");
			expect(idColumn?.isAutoIncrementing).toBe(true);
			expect(idColumn?.isNullable).toBe(true); // SQLite primary keys can be NULL until a value is inserted

			const nameColumn = table?.columns.find((c) => c.name === "name");
			expect(nameColumn?.isNullable).toBe(false);

			const ageColumn = table?.columns.find((c) => c.name === "age");
			expect(ageColumn?.isNullable).toBe(true);

			const isActiveColumn = table?.columns.find((c) => c.name === "is_active");
			expect(isActiveColumn?.hasDefaultValue).toBe(true);
		});
	});

	it("better-auth adapter integration", async () => {
		const { DatabaseSync } = await import("node:sqlite");
		const db = new DatabaseSync(":memory:");
		const betterAuthKysely = new Kysely({
			dialect: new NodeSqliteDialect({
				database: db,
			}),
		});

		const opts: BetterAuthOptions = {
			database: {
				db: betterAuthKysely,
				type: "sqlite",
			},
			user: {
				fields: {
					email: "email_address",
				},
				additionalFields: {
					test: {
						type: "string",
						defaultValue: "test",
					},
				},
			},
			session: {
				modelName: "sessions",
			},
		};

		beforeAll(async () => {
			const { runMigrations } = await getMigrations(opts);
			await runMigrations();
		});

		afterAll(async () => {
			await betterAuthKysely.destroy();
			db.close();
		});

		const adapter = kyselyAdapter(betterAuthKysely, {
			type: "sqlite",
			debugLogs: {
				isRunningAdapterTests: true,
			},
		});

		await runAdapterTest({
			getAdapter: async (customOptions = {}) => {
				return adapter(merge(customOptions, opts));
			},
			testPrefix: "node-sqlite",
		});
	});
});
