import { randomUUID } from "node:crypto";
import type { ExpectedSchema } from "@better-auth/core/db/internal";
import { diffSchema } from "@better-auth/core/db/internal";
import type { KyselyPlugin } from "kysely";
import {
	CamelCasePlugin,
	DummyDriver,
	Kysely,
	PostgresDialect,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
	sql,
} from "kysely";
import { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
	findSchemaProblems,
	getPostgresSchema,
	toPhysicalSchema,
} from "./schema-check";

/**
 * A connection that compiles queries and never sends them.
 */
function connection(plugins: KyselyPlugin[] = []) {
	return new Kysely<unknown>({
		dialect: {
			createAdapter: () => new SqliteAdapter(),
			createDriver: () => new DummyDriver(),
			createIntrospector: (db) => new SqliteIntrospector(db),
			createQueryCompiler: () => new SqliteQueryCompiler(),
		},
		plugins,
	});
}

const expected: ExpectedSchema = {
	twoFactor: {
		fields: {
			userId: { type: "string" },
			backupCodes: { type: "string", required: false },
		},
	},
};

describe("toPhysicalSchema", () => {
	it("keeps the schema when no plugin renames identifiers", () => {
		expect(toPhysicalSchema(connection(), expected)).toEqual(expected);
	});

	it("uses the identifiers the plugins send", () => {
		expect(
			toPhysicalSchema(connection([new CamelCasePlugin()]), expected),
		).toEqual({
			two_factor: {
				fields: {
					user_id: { type: "string" },
					backup_codes: { type: "string", required: false },
				},
			},
		});
	});

	it("carries the schema a plugin qualifies tables with", () => {
		const physical = toPhysicalSchema(
			connection().withSchema("auth"),
			expected,
		);
		expect(physical.twoFactor?.schema).toBe("auth");
		expect(
			toPhysicalSchema(connection(), expected).twoFactor?.schema,
		).toBeUndefined();
	});

	it("splits a schema-qualified model name into schema and table", () => {
		const physical = toPhysicalSchema(connection(), {
			"internal.users": { fields: { email: { type: "string" } } },
		});
		expect(physical).toEqual({
			users: { fields: { email: { type: "string" } }, schema: "internal" },
		});
	});

	/**
	 * @see https://kysely-org.github.io/kysely-apidoc/classes/CamelCasePlugin.html
	 */
	it("compares the implicit id using its physical identifier", () => {
		const physical = toPhysicalSchema(
			connection([new CamelCasePlugin({ upperCase: true })]),
			expected,
		);
		const columns = ["ID", "USER_ID", "BACKUP_CODES"].map((name) => ({
			name,
			nullable: false,
			hasDefault: false,
		}));
		expect(diffSchema(physical, [{ name: "TWO_FACTOR", columns }])).toEqual([]);
		expect(
			diffSchema(physical, [{ name: "TWO_FACTOR", columns: columns.slice(1) }]),
		).toEqual([{ kind: "missing-column", table: "TWO_FACTOR", column: "ID" }]);
	});

	it("follows the plugin options rather than a fixed rule", () => {
		expect(
			toPhysicalSchema(
				connection([new CamelCasePlugin({ upperCase: true })]),
				expected,
			),
		).toHaveProperty("TWO_FACTOR.fields.USER_ID");
	});
});

/**
 * @see https://www.postgresql.org/docs/current/ddl-schemas.html#DDL-SCHEMAS-PATH
 */
describe("PostgreSQL schema validation", () => {
	const CONNECTION_STRING =
		"postgres://user:password@localhost:5433/better_auth";
	let postgresAvailable = false;

	beforeAll(async () => {
		const probe = new Pool({
			connectionString: CONNECTION_STRING,
			connectionTimeoutMillis: 2000,
		});
		try {
			await probe.query("SELECT 1");
			postgresAvailable = true;
		} catch {
			// Integration tests require the local PostgreSQL test database.
		} finally {
			await probe.end();
		}
	});

	beforeEach(({ skip }) => {
		if (!postgresAvailable)
			skip("Local PostgreSQL test database is unavailable");
	});

	it("keeps the migration fallback when search_path is empty", async ({
		onTestFinished,
	}) => {
		const pool = new Pool({ connectionString: CONNECTION_STRING, max: 1 });
		const db = new Kysely({
			dialect: new PostgresDialect({ pool }),
			plugins: [new CamelCasePlugin()],
		});
		onTestFinished(() => db.destroy());

		await db.transaction().execute(async (trx) => {
			await sql`SET TRANSACTION READ ONLY`.execute(trx);
			await sql`SELECT pg_catalog.set_config('search_path', '', true)`.execute(
				trx,
			);
			await expect(getPostgresSchema(trx)).resolves.toBe("public");
		});
	});

	it("reads PostgreSQL metadata without changing the schema", async ({
		onTestFinished,
	}) => {
		const pool = new Pool({ connectionString: CONNECTION_STRING, max: 1 });
		const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
		onTestFinished(() => db.destroy());
		const table = `ba_missing_${randomUUID().replaceAll("-", "")}`;

		await expect(
			findSchemaProblems(db, "postgres", { [table]: { fields: {} } }),
		).resolves.toEqual([{ kind: "missing-table", table }]);
	});

	it("resolves role schemas and each table in search-path order", async ({
		onTestFinished,
	}) => {
		const role = `ba_readiness_${randomUUID().replaceAll("-", "")}`;
		const fallback = `${role}_fallback`;
		const pool = new Pool({ connectionString: CONNECTION_STRING, max: 1 });
		const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
		onTestFinished(() => db.destroy());
		await pool.query(`CREATE ROLE "${role}"`);
		onTestFinished(async () => {
			await pool.query("RESET ROLE");
			await pool.query(`DROP ROLE "${role}"`);
		});
		await pool.query(`CREATE SCHEMA "${role}" AUTHORIZATION "${role}"`);
		onTestFinished(() =>
			pool.query(`DROP SCHEMA "${role}" CASCADE`).then(() => {}),
		);
		await pool.query(`CREATE SCHEMA "${fallback}" AUTHORIZATION "${role}"`);
		onTestFinished(() =>
			pool.query(`DROP SCHEMA "${fallback}" CASCADE`).then(() => {}),
		);
		await pool.query(`SET ROLE "${role}"`);
		await pool.query(`SET search_path TO "$user", "${fallback}"`);
		await pool.query(
			'CREATE TABLE account (id text PRIMARY KEY, "providerId" text NOT NULL)',
		);
		await pool.query(
			`CREATE TABLE "${fallback}".account (id text PRIMARY KEY, issuer text NOT NULL)`,
		);
		await pool.query(
			`CREATE TABLE "${fallback}".session (id text PRIMARY KEY, token text NOT NULL)`,
		);

		await expect(
			findSchemaProblems(db, "postgres", {
				account: { fields: { providerId: { type: "string" } } },
				session: { fields: { token: { type: "string" } } },
			}),
		).resolves.toEqual([]);
	});
});
