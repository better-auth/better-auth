import type { BetterAuthOptions } from "@better-auth/core";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { betterAuth } from "../auth";
import { getMigrations } from "./get-migration";

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
	"Migration Generation - Custom ID Field Names",
	() => {
		const customSchema = "auth_test_custom_id";

		const customSchemaPool = new Pool({
			connectionString: `postgres://user:password@localhost:5433/better_auth?options=-c search_path=${customSchema}`,
		});

		beforeAll(async () => {
			// Setup: Create custom schema
			await customSchemaPool.query(
				`DROP SCHEMA IF EXISTS ${customSchema} CASCADE`,
			);
			await customSchemaPool.query(`CREATE SCHEMA ${customSchema}`);
		});

		afterAll(async () => {
			// Cleanup
			await customSchemaPool.query(
				`DROP SCHEMA IF EXISTS ${customSchema} CASCADE`,
			);
			await customSchemaPool.end();
		});

		it("should generate migration with custom ID field name (user_id) for user table", async () => {
			const config: BetterAuthOptions = {
				database: customSchemaPool,
				emailAndPassword: {
					enabled: true,
				},
				user: {
					fields: {
						id: "user_id",
					},
				},
			};

			const { toBeCreated, compileMigrations } = await getMigrations(config);

			const userTable = toBeCreated.find((t) => t.table === "user");
			expect(userTable).toBeDefined();

			// Check that the user table has the id field configured with custom fieldName
			expect(userTable?.fields).toHaveProperty("id");
			const idField = userTable?.fields.id;
			expect(idField?.fieldName).toBe("user_id");

			// Compile migrations and check SQL
			const sql = await compileMigrations();
			expect(sql).toContain("user_id");
			expect(sql).toContain('CREATE TABLE "user"');
		});

		it("should generate migration with custom ID field name for session table referencing user_id", async () => {
			const config: BetterAuthOptions = {
				database: customSchemaPool,
				emailAndPassword: {
					enabled: true,
				},
				user: {
					fields: {
						id: "user_id",
					},
				},
				session: {
					fields: {
						userId: "user_id",
					},
				},
			};

			const { toBeCreated, compileMigrations } = await getMigrations(config);

			const sessionTable = toBeCreated.find((t) => t.table === "session");
			expect(sessionTable).toBeDefined();

			// Check that session table has userId field configured with custom fieldName
			expect(sessionTable?.fields).toHaveProperty("userId");
			const userIdField = sessionTable?.fields.userId;
			expect(userIdField?.fieldName).toBe("user_id");
			expect(userIdField?.references?.field).toBe("id"); // References logical "id" field
			expect(userIdField?.references?.model).toBe("user");

			// Compile migrations and check SQL
			const sql = await compileMigrations();
			expect(sql).toContain("user_id");
			expect(sql).toMatch(/REFERENCES\s+"user"\("id"\)/i);
		});

		it("should generate migration with custom ID field name for account table", async () => {
			const config: BetterAuthOptions = {
				database: customSchemaPool,
				emailAndPassword: {
					enabled: true,
				},
				user: {
					fields: {
						id: "user_id",
					},
				},
				account: {
					fields: {
						id: "account_id",
						userId: "user_id",
					},
				},
			};

			const { toBeCreated, compileMigrations } = await getMigrations(config);

			const accountTable = toBeCreated.find((t) => t.table === "account");
			expect(accountTable).toBeDefined();

			// Check that account table has custom ID field
			expect(accountTable?.fields).toHaveProperty("id");
			const idField = accountTable?.fields.id;
			expect(idField?.fieldName).toBe("account_id");

			// Check that userId field references user.id correctly
			expect(accountTable?.fields).toHaveProperty("userId");
			const userIdField = accountTable?.fields.userId;
			expect(userIdField?.fieldName).toBe("user_id");
			expect(userIdField?.references?.field).toBe("id");
			expect(userIdField?.references?.model).toBe("user");

			// Compile migrations and check SQL
			const sql = await compileMigrations();
			expect(sql).toContain("account_id");
			expect(sql).toContain('CREATE TABLE "account"');
		});

		it("should detect existing table with custom ID field name and not recreate it", async () => {
			// First, create a table with custom ID field name
			await customSchemaPool.query(`
				CREATE TABLE IF NOT EXISTS ${customSchema}.user (
					user_id TEXT PRIMARY KEY NOT NULL,
					email TEXT NOT NULL,
					name TEXT NOT NULL,
					"emailVerified" BOOLEAN NOT NULL,
					"createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
					"updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
				);
			`);

			const config: BetterAuthOptions = {
				database: customSchemaPool,
				emailAndPassword: {
					enabled: true,
				},
				user: {
					fields: {
						id: "user_id",
					},
				},
			};

			const { toBeCreated, toBeAdded } = await getMigrations(config);

			// Should not need to create user table since it exists with correct ID field name
			const userTable = toBeCreated.find((t) => t.table === "user");
			expect(userTable).toBeUndefined();

			// Should not need to add fields if structure matches
			const userFieldsToAdd = toBeAdded.find((t) => t.table === "user");
			expect(userFieldsToAdd).toBeUndefined();

			// Cleanup
			await customSchemaPool.query(
				`DROP TABLE IF EXISTS ${customSchema}.user CASCADE`,
			);
		});

		it("should detect missing fields when table exists with custom ID field name", async () => {
			// Create a table with custom ID but missing some fields
			await customSchemaPool.query(`
				CREATE TABLE IF NOT EXISTS ${customSchema}.user (
					user_id TEXT PRIMARY KEY NOT NULL,
					email TEXT NOT NULL,
					name TEXT NOT NULL
				);
			`);

			const config: BetterAuthOptions = {
				database: customSchemaPool,
				emailAndPassword: {
					enabled: true,
				},
				user: {
					fields: {
						id: "user_id",
					},
				},
			};

			const { toBeCreated, toBeAdded } = await getMigrations(config);

			// Should not need to create user table
			const userTable = toBeCreated.find((t) => t.table === "user");
			expect(userTable).toBeUndefined();

			// Should need to add missing fields
			const userFieldsToAdd = toBeAdded.find((t) => t.table === "user");
			expect(userFieldsToAdd).toBeDefined();
			expect(userFieldsToAdd?.fields).toHaveProperty("emailVerified");
			expect(userFieldsToAdd?.fields).toHaveProperty("createdAt");
			expect(userFieldsToAdd?.fields).toHaveProperty("updatedAt");

			// Cleanup
			await customSchemaPool.query(
				`DROP TABLE IF EXISTS ${customSchema}.user CASCADE`,
			);
		});

		it("should generate correct migration SQL with custom ID field names for all tables", async () => {
			const config: BetterAuthOptions = {
				database: customSchemaPool,
				emailAndPassword: {
					enabled: true,
				},
				user: {
					fields: {
						id: "user_id",
					},
				},
				session: {
					fields: {
						id: "session_id",
						userId: "user_id",
					},
				},
				account: {
					fields: {
						id: "account_id",
						userId: "user_id",
					},
				},
			};

			const { compileMigrations } = await getMigrations(config);
			const sql = await compileMigrations();

			// Check that all custom ID field names are present
			expect(sql).toContain("user_id");
			expect(sql).toContain("session_id");
			expect(sql).toContain("account_id");

			// Check that foreign key references use correct field names
			expect(sql).toMatch(/REFERENCES\s+"user"\("user_id"\)/i);
		});
	},
);
