import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { getMigrations } from "./get-migration";
import type { BetterAuthOptions } from "@better-auth/core";

// Check if PostgreSQL is available
let isPostgresAvailable = false;
try {
	const testPool = new Pool({
		connectionString: "postgres://user:password@localhost:5433/better_auth",
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
			connectionString: "postgres://user:password@localhost:5433/better_auth",
		});

		const customSchemaPool = new Pool({
			connectionString: `postgres://user:password@localhost:5433/better_auth?options=-c search_path=${customSchema}`,
		});

		const publicDb = new Kysely({
			dialect: new PostgresDialect({ pool: publicPool }),
		});

		const customSchemaDb = new Kysely({
			dialect: new PostgresDialect({ pool: customSchemaPool }),
		});

		beforeAll(async () => {
			// Setup: Create custom schema and a table in public schema
			await publicPool.query(`DROP SCHEMA IF EXISTS ${customSchema} CASCADE`);
			await publicPool.query(`CREATE SCHEMA ${customSchema}`);

			// Create a conflicting table in the public schema
			await publicPool.query(`
			DROP TABLE IF EXISTS public.user CASCADE;
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
			// Destroy Kysely instances first (they will close connections but not end the pool)
			await publicDb.destroy();
			await customSchemaDb.destroy();
			// Then end the pools
			await publicPool.end();
			await customSchemaPool.end();
		});

		it("should detect custom schema from search_path", async () => {
			const config: BetterAuthOptions = {
				database: { db: customSchemaDb, type: "postgres" },
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
				database: { db: customSchemaDb, type: "postgres" },
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

		it("should handle public schema correctly (default behavior)", async () => {
			// First, create the user table in public schema with all required fields
			await publicPool.query(`
			DROP TABLE IF EXISTS public.user CASCADE;
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
				database: { db: publicDb, type: "postgres" },
				emailAndPassword: {
					enabled: true,
				},
			};

			const { toBeCreated, toBeAdded } = await getMigrations(config);

			// Should detect existing user table in public schema
			const userTableCreated = toBeCreated.find((t) => t.table === "user");
			expect(userTableCreated).toBeUndefined();

			// Other tables should still need to be created
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
				database: { db: customSchemaDb, type: "postgres" },
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
