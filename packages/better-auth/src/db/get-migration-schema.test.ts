import type { BetterAuthOptions } from "@better-auth/core";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { betterAuth } from "../auth";
import { getMigrations } from "./get-migration";

const CONNECTION_STRING = "postgres://user:password@localhost:5433/better_auth";
// Check if PostgreSQL is available
let isPostgresAvailable = false;
try {
	const testPool = new Pool({
		connectionString: CONNECTION_STRING,
		connectionTimeoutMillis: 2000,
	});
	await testPool.query("SELECT 1");
	await testPool.end();
	isPostgresAvailable = true;
} catch {
	// PostgreSQL not available, tests will be skipped
	isPostgresAvailable = false;
}

describe.runIf(isPostgresAvailable)(
	"PostgreSQL Schema Detection in Migrations",
	() => {
		const customSchema = "auth_test";

		// Create two separate connection pools
		const publicPool = new Pool({
			connectionString: CONNECTION_STRING,
		});

		const customSchemaPool = new Pool({
			connectionString: `${CONNECTION_STRING}?options=-c search_path=${customSchema}`,
		});

		beforeAll(async () => {
			// Setup: Create custom schema and a table in public schema
			await publicPool.query(`DROP SCHEMA IF EXISTS ${customSchema} CASCADE`);
			await publicPool.query(`CREATE SCHEMA ${customSchema}`);
			await publicPool.query(
				`DROP TABLE IF EXISTS public.user CASCADE; DROP TABLE IF EXISTS public.session CASCADE; DROP TABLE IF EXISTS public.account CASCADE; DROP TABLE IF EXISTS public.verification CASCADE;`,
			);
			// Create a conflicting table in the public schema
			await publicPool.query(`
			CREATE TABLE public.user (
				id SERIAL PRIMARY KEY,
				email VARCHAR(255) NOT NULL,
				name VARCHAR(255)
			);
		`);
		});

		afterAll(async () => {
			// Cleanup
			await publicPool.query(`DROP SCHEMA IF EXISTS ${customSchema} CASCADE`);
			await publicPool.query(`DROP TABLE IF EXISTS public.user CASCADE`);
			await publicPool.end();
			await customSchemaPool.end();
		});

		it("should detect custom schema from search_path", async () => {
			// Use Pool with search_path option
			const config: BetterAuthOptions = {
				database: customSchemaPool,
				emailAndPassword: {
					enabled: true,
				},
			};

			const { toBeCreated, toBeAdded } = await getMigrations(config);

			// With custom schema, should detect no existing tables in that schema
			// Therefore all tables should be in toBeCreated
			const userTableCreated = toBeCreated.find((t) => t.table === "user");
			const userTableToBeAdded = toBeAdded.find((t) => t.table === "user");

			expect(userTableCreated).toBeDefined();
			expect(userTableToBeAdded).toBeUndefined();

			// The user table should have all fields (not just missing ones)
			expect(userTableCreated?.fields).toHaveProperty("email");
			expect(userTableCreated?.fields).toHaveProperty("name");
			expect(userTableCreated?.fields).toHaveProperty("emailVerified");
		});

		it("should not be affected by tables in public schema when using custom schema", async () => {
			// Even though there's a 'user' table in public schema,
			// when we use custom schema, migrations should create a new user table
			const config: BetterAuthOptions = {
				database: customSchemaPool,
				emailAndPassword: {
					enabled: true,
				},
			};

			const { toBeCreated } = await getMigrations(config);

			// Should want to create user table (because it doesn't exist in custom schema)
			const userTable = toBeCreated.find((t) => t.table === "user");
			expect(userTable).toBeDefined();

			// Verify the table in public schema still exists and is not affected
			const publicTableCheck = await publicPool.query(
				`SELECT table_name FROM information_schema.tables
			 WHERE table_schema = 'public' AND table_name = 'user'`,
			);
			expect(publicTableCheck.rows.length).toBe(1);
		});

		it("should only inspect tables in public schema when using default connection", async () => {
			await publicPool.query(`DROP TABLE IF EXISTS public.user CASCADE`);
			await publicPool.query(`
			CREATE TABLE public.user (
				id TEXT PRIMARY KEY NOT NULL,
				email TEXT NOT NULL,
				name TEXT NOT NULL,
				"emailVerified" BOOLEAN NOT NULL,
				image TEXT,
				"createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
				"updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
			);
		`);

			const config: BetterAuthOptions = {
				database: publicPool,
				emailAndPassword: {
					enabled: true,
				},
			};

			const { toBeCreated, toBeAdded } = await getMigrations(config);

			// Should detect existing user table in public schema
			const userTable = toBeCreated.find((t) => t.table === "user");
			expect(userTable).toBeUndefined();

			// Should not need to add fields if table structure matches
			const userFieldsToAdd = toBeAdded.find((t) => t.table === "user");
			expect(userFieldsToAdd).toBeUndefined();

			// Session, account, verification tables should need to be created
			const sessionTable = toBeCreated.find((t) => t.table === "session");
			expect(sessionTable).toBeDefined();
		});

		it("should create tables in custom schema when running migrations", async () => {
			// Clean the custom schema
			await customSchemaPool.query(
				`DROP SCHEMA IF EXISTS ${customSchema} CASCADE`,
			);
			await customSchemaPool.query(`CREATE SCHEMA ${customSchema}`);

			const config: BetterAuthOptions = {
				database: customSchemaPool,
				emailAndPassword: {
					enabled: true,
				},
			};

			const { runMigrations } = await getMigrations(config);
			await runMigrations();

			// Verify tables were created in custom schema
			const tablesInCustomSchema = await customSchemaPool.query(
				`SELECT table_name FROM information_schema.tables
			 WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
				[customSchema],
			);

			const tableNames = tablesInCustomSchema.rows.map(
				(r: { table_name: string }) => r.table_name,
			);

			expect(tableNames).toContain("user");
			expect(tableNames).toContain("session");
			expect(tableNames).toContain("account");
			expect(tableNames).toContain("verification");
		});
	},
);

describe.runIf(isPostgresAvailable)(
	"PostgreSQL Schema Detection in Migrations",
	() => {
		const pool = new Pool({
			connectionString: CONNECTION_STRING,
		});
		const schema = "uuid_test";

		const schemaPool = new Pool({
			connectionString: `${CONNECTION_STRING}?options=-c search_path=${schema}`,
		});

		beforeAll(async () => {
			await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
			await schemaPool.query(`CREATE SCHEMA ${schema}`);
		});

		afterAll(async () => {
			await schemaPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
			await pool.end();
			await schemaPool.end();
		});

		it("should use uuid for id when `advanced.database.generateId` is set to 'uuid'", async () => {
			const config: BetterAuthOptions = {
				database: schemaPool,
				emailAndPassword: {
					enabled: true,
				},
				advanced: {
					database: {
						generateId: "uuid",
					},
				},
			};
			const { runMigrations, compileMigrations } = await getMigrations(config);
			await runMigrations();
			const migrations = await compileMigrations();
			const auth = betterAuth(config);

			const user = await auth.api.signUpEmail({
				body: {
					email: "test@test.com",
					password: "test123456",
					name: "test user",
				},
			});
			const uuidRegex =
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
			expect(user.user.id).toMatch(uuidRegex);

			// run migrations again to ensure no migrations are needed & no errors are thrown
			const { compileMigrations: round2Migrations } =
				await getMigrations(config);
			const secondRoundOfMigrations = await round2Migrations();
			expect(secondRoundOfMigrations).toEqual(";");
		});
	},
);

describe.runIf(isPostgresAvailable)(
	"PostgreSQL Identity Column Generation",
	() => {
		const pool = new Pool({
			connectionString: CONNECTION_STRING,
		});
		const schema = "identity_test";

		const schemaPool = new Pool({
			connectionString: `${CONNECTION_STRING}?options=-c search_path=${schema}`,
		});

		beforeAll(async () => {
			await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
			await schemaPool.query(`CREATE SCHEMA ${schema}`);
		});

		afterAll(async () => {
			await schemaPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
			await pool.end();
			await schemaPool.end();
		});

		it("should use GENERATED ALWAYS AS IDENTITY instead of SERIAL when `advanced.database.generateId` is set to 'serial'", async () => {
			const config: BetterAuthOptions = {
				database: schemaPool,
				emailAndPassword: {
					enabled: true,
				},
				advanced: {
					database: {
						generateId: "serial",
					},
				},
			};

			const { compileMigrations } = await getMigrations(config);
			const migrations = await compileMigrations();

			expect(migrations).toContain("GENERATED BY DEFAULT AS IDENTITY");
			expect(migrations).not.toContain("SERIAL");

			const userTableMatch = migrations.match(/create table.*?"user".*?\(/is);
			expect(userTableMatch).toBeDefined();

			const idColumnMatch = migrations.match(
				/"id"\s+integer\s+GENERATED\s+BY\s+DEFAULT\s+AS\s+IDENTITY/gi,
			);
			expect(idColumnMatch).toBeDefined();
			expect(idColumnMatch?.length).toBeGreaterThan(0);
		});
	},
);

describe.runIf(isPostgresAvailable)("PostgreSQL Column Additions", () => {
	const pool = new Pool({
		connectionString: CONNECTION_STRING,
	});
	const schema = "column_test";

	const schemaPool = new Pool({
		connectionString: `${CONNECTION_STRING}?options=-c search_path=${schema}`,
	});

	afterAll(async () => {
		await schemaPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
		await pool.end();
		await schemaPool.end();
	});
	beforeAll(async () => {
		await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
		await schemaPool.query(`CREATE SCHEMA ${schema}`);
	});

	it("should update default tables with plugin schema fields", async () => {
		const config: BetterAuthOptions = {
			database: schemaPool,
			emailAndPassword: {
				enabled: true,
			},
		};

		// Run the initial migration
		const migration = await getMigrations(config);
		await migration.runMigrations();

		// Change the config to add a plugin schema
		config.plugins = [
			{
				id: "test",
				schema: {
					user: {
						fields: {
							role: {
								type: "string",
							},
						},
					},
					session: {
						fields: {
							impersonatedBy: {
								type: "string",
							},
						},
					},
				},
			},
		];
		const { toBeAdded, toBeCreated } = await getMigrations(config);
		console.log(toBeAdded);
		expect(toBeCreated.length).toBe(0);
		expect(toBeAdded.length).toBe(2);
		expect(toBeAdded).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					table: "user",
					fields: expect.objectContaining({
						role: expect.objectContaining({ type: "string" }),
					}),
				}),
				expect.objectContaining({
					table: "session",
					fields: expect.objectContaining({
						impersonatedBy: expect.objectContaining({ type: "string" }),
					}),
				}),
			]),
		);
	});
});
