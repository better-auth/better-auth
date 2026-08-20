import type { DatabaseConnection, Dialect, Driver } from "kysely";
import { SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from "kysely";
import { describe, expect, it } from "vitest";
import { getMigrationDatabase } from "./migration-database";

function createUnknownDriver(): Driver {
	const connection: DatabaseConnection = {
		async executeQuery() {
			throw new Error("The unknown dialect must not run queries");
		},
		async *streamQuery() {
			throw new Error("The unknown dialect must not stream queries");
		},
	};
	return {
		async init() {},
		async acquireConnection() {
			return connection;
		},
		async beginTransaction() {},
		async commitTransaction() {},
		async rollbackTransaction() {},
		async releaseConnection() {},
		async destroy() {},
	};
}

function createUnknownDialect(): Dialect {
	return {
		createAdapter: () => new SqliteAdapter(),
		createDriver: createUnknownDriver,
		createIntrospector: (database) => new SqliteIntrospector(database),
		createQueryCompiler: () => new SqliteQueryCompiler(),
	};
}

describe("getMigrationDatabase", () => {
	it("reports the undeclared dialect when the database is a raw Kysely dialect", async () => {
		await expect(
			getMigrationDatabase({ database: createUnknownDialect() }),
		).rejects.toThrow(
			"Migrations cannot determine the SQL dialect of the configured database. Declare it with the `database: { dialect, type }` configuration form.",
		);
	});

	it("accepts the raw dialect once the type is declared", async () => {
		const database = await getMigrationDatabase({
			database: { dialect: createUnknownDialect(), type: "sqlite" },
		});

		expect(database).toMatchObject({
			adapterId: "kysely",
			databaseType: "sqlite",
			inTransaction: false,
		});
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10575#discussion_r3812055073
	 */
	it("does not expose transactions when a declared dialect disables them", async () => {
		const database = await getMigrationDatabase({
			database: {
				dialect: createUnknownDialect(),
				transaction: false,
				type: "sqlite",
			},
		});

		expect(database.transaction).toBeUndefined();
	});
});
