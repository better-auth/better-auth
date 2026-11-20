import type { BetterAuthOptions } from "@better-auth/core";
import type { RowDataPacket } from "mysql2/promise";
import { createPool } from "mysql2/promise";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMigrations, UnsafeMigrationError } from "./get-migration";

// The populated-table guard in `getMigrations` is dialect-independent by
// contract: MySQL's `sql_mode` silently accepts `ADD COLUMN ... NOT NULL`
// with no default and backfills an implicit value, which is exactly the
// corruption the guard exists to prevent. SQLite coverage lives in
// get-migration.test.ts; this file proves the refusal also holds against
// real Postgres and MySQL connections, and that no statement runs before it.

const POSTGRES_CONNECTION_STRING =
	"postgres://user:password@localhost:5433/better_auth";
let isPostgresAvailable = false;
try {
	const testPool = new Pool({
		connectionString: POSTGRES_CONNECTION_STRING,
		connectionTimeoutMillis: 2000,
	});
	await testPool.query("SELECT 1");
	await testPool.end();
	isPostgresAvailable = true;
} catch {
	isPostgresAvailable = false;
}

const MYSQL_CONNECTION_STRING =
	"mysql://user:password@localhost:3307/better_auth";
let isMysqlAvailable = false;
try {
	const testPool = createPool({
		uri: MYSQL_CONNECTION_STRING,
		connectTimeout: 2000,
	});
	await testPool.query("SELECT 1");
	await testPool.end();
	isMysqlAvailable = true;
} catch {
	isMysqlAvailable = false;
}

function unsafeChangeConfig(database: BetterAuthOptions["database"]) {
	return {
		database,
		plugins: [
			{
				id: "unsafe-change",
				schema: {
					populatedNoDefault: {
						fields: {
							name: { type: "string" as const },
							connectionIssuer: {
								type: "string" as const,
								required: true,
							},
						},
					},
				},
			},
		],
	} satisfies BetterAuthOptions;
}

describe.runIf(isPostgresAvailable)(
	"PostgreSQL unsafe migration guardrail",
	() => {
		const schema = "unsafe_change_test";
		const pool = new Pool({ connectionString: POSTGRES_CONNECTION_STRING });
		const schemaPool = new Pool({
			connectionString: `${POSTGRES_CONNECTION_STRING}?options=-c search_path=${schema}`,
		});

		beforeAll(async () => {
			await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
			await pool.query(`CREATE SCHEMA ${schema}`);
			await schemaPool.query(
				`CREATE TABLE "populatedNoDefault" ("id" text primary key not null, "name" text not null)`,
			);
			await schemaPool.query(
				`INSERT INTO "populatedNoDefault" ("id", "name") VALUES ('p1', 'existing-row')`,
			);
		});

		afterAll(async () => {
			await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
			await pool.end();
			await schemaPool.end();
		});

		it("refuses a required no-default column on a populated table before any statement executes", async () => {
			const failure = await getMigrations(unsafeChangeConfig(schemaPool)).catch(
				(error: unknown) => error,
			);

			expect(failure).toBeInstanceOf(UnsafeMigrationError);

			const columns = await schemaPool.query<{ column_name: string }>(
				`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'populatedNoDefault'`,
				[schema],
			);
			expect(
				columns.rows.some((row) => row.column_name === "connectionIssuer"),
			).toBe(false);
		});
	},
);

describe.runIf(isMysqlAvailable)("MySQL unsafe migration guardrail", () => {
	const pool = createPool({ uri: MYSQL_CONNECTION_STRING });

	beforeAll(async () => {
		await pool.query("DROP TABLE IF EXISTS `populatedNoDefault`");
		await pool.query(
			"CREATE TABLE `populatedNoDefault` (`id` varchar(36) primary key not null, `name` text not null)",
		);
		await pool.query(
			"INSERT INTO `populatedNoDefault` (`id`, `name`) VALUES ('p1', 'existing-row')",
		);
	});

	afterAll(async () => {
		await pool.query("DROP TABLE IF EXISTS `populatedNoDefault`");
		await pool.end();
	});

	/**
	 * This is the silent-corruption regression the guard exists for: without
	 * it, MySQL's default `sql_mode` accepts `ADD COLUMN ... NOT NULL` with
	 * no default and fills every existing row with an implicit empty string,
	 * reporting a successful migration over corrupted data.
	 */
	it("refuses a required no-default column on a populated table before any statement executes", async () => {
		const failure = await getMigrations(unsafeChangeConfig(pool)).catch(
			(error: unknown) => error,
		);

		expect(failure).toBeInstanceOf(UnsafeMigrationError);

		const [rows] = await pool.query<RowDataPacket[]>(
			"SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'populatedNoDefault'",
		);
		expect(rows.some((row) => row.COLUMN_NAME === "connectionIssuer")).toBe(
			false,
		);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11520
 */
describe.runIf(isMysqlAvailable)("MySQL existing-table index budget", () => {
	const pool = createPool({ uri: MYSQL_CONNECTION_STRING });
	const wideLookupConfig = (
		generateId: "serial" | undefined,
	): BetterAuthOptions => ({
		database: pool,
		advanced: { database: { generateId } },
		plugins: [
			{
				id: "wide-lookup",
				schema: {
					wideLookup: {
						fields: Object.fromEntries(
							["a", "b", "c", "d"].map((field) => [
								field,
								{ type: "string" as const },
							]),
						),
						indexes: [{ fields: ["a", "b", "c", "d", "id"] }],
					},
				},
			},
		],
	});
	const createWideLookup = async (idColumn: string) => {
		await pool.query("DROP TABLE IF EXISTS `wideLookup`");
		await pool.query(
			`CREATE TABLE \`wideLookup\` (${idColumn}, \`a\` varchar(191) not null, \`b\` varchar(191) not null, \`c\` varchar(191) not null, \`d\` varchar(191) not null)`,
		);
	};

	afterAll(async () => {
		await pool.query("DROP TABLE IF EXISTS `wideLookup`");
		await pool.end();
	});

	it("counts a string id when adding an index to an existing table", async () => {
		await createWideLookup("`id` varchar(36) primary key not null");

		await expect(getMigrations(wideLookupConfig(undefined))).rejects.toThrow(
			`Cannot create database index "wideLookup_a_b_c_d_id_idx" on existing table "wideLookup" because its columns can exceed MySQL's 3072-byte index-key limit.`,
		);
	});

	it("counts a serial id as a fixed-size column on an existing table", async () => {
		await createWideLookup("`id` int auto_increment primary key not null");

		const migrations = await getMigrations(wideLookupConfig("serial"));

		expect(await migrations.compileMigrations()).toContain(
			"create index `wideLookup_a_b_c_d_id_idx` on `wideLookup` (`a`, `b`, `c`, `d`, `id`)",
		);
	});
});
