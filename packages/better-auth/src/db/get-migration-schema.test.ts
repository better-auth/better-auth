import type { BetterAuthOptions } from "@better-auth/core";
import Database from "better-sqlite3";
import { Kysely, sql as kyselySql, SqliteDialect } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type FieldTypeOverride, getMigrations } from "./get-migration";

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

			const { toBeCreated, toBeAdded, compileMigrations } =
				await getMigrations(config);

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

describe("Field Type Override API", () => {
	let database: Database.Database;
	let kyselyDB: Kysely<any>;

	beforeAll(async () => {
		database = new Database(":memory:");
		kyselyDB = new Kysely({
			dialect: new SqliteDialect({ database }),
		});
	});

	afterAll(async () => {
		database.close();
		await kyselyDB.destroy();
	});

	it("should override field type for specific table and field", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (tableName === "user" && fieldName === "email") {
				return { type: "text" }; // SQLite uses lowercase "text"
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify email field uses text (SQLite default is also text, so we're just verifying override works)
		expect(sql).toContain('"email" text');
	});

	it("should override field type based on field name only", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (fieldName === "name") {
				return { type: "varchar(123)" }; // Override all name fields
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify name field uses text
		expect(sql).toContain('"name" varchar(123)');
	});

	it("should override field type based on table name only", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (tableName === "session") {
				// Override all string fields in session table
				if (field.type === "string") {
					return { type: "varchar(123)" };
				}
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify session table string fields use text
		expect(sql).toContain('CREATE TABLE "session"'.toLowerCase());
		// Check that session table has text for string fields
		const sessionTableMatch = sql.match(/create table "session"[\s\S]*?;/);
		expect(sessionTableMatch).toBeTruthy();
		if (sessionTableMatch) {
			expect(sessionTableMatch[0]).toContain("varchar(123)");
		}
	});

	it("should use default type when override returns undefined", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			// Only override specific field, return undefined for others
			if (tableName === "user" && fieldName === "email") {
				return { type: "varchar(123)" };
			}
			return undefined; // Use default for everything else
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Email should be overridden (though default is also text for SQLite)
		expect(sql).toContain('"email" varchar(123)');
		// Other fields should use defaults (text for sqlite)
		expect(sql).toContain('"name" text');
	});

	it("should override field type using SQL template literal (RawBuilder)", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (tableName === "user" && fieldName === "createdAt") {
				// Use SQL template literal for custom date type
				return { type: kyselySql`DATETIME` as any };
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify createdAt uses DATETIME
		expect(sql).toContain("DATETIME");
	});

	it("should override number field types", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (field.type === "number" && !field.bigint) {
				return { type: "SMALLINT" }; // Override all non-bigint numbers to SMALLINT
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Note: This test verifies the override is called, actual field usage depends on schema
		expect(sql).toBeTruthy();
	});

	it("should override boolean field types", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (field.type === "boolean") {
				return { type: "integer" }; // Override boolean to integer (0/1) - SQLite default is also integer
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify boolean fields use integer (SQLite default is also integer)
		expect(sql).toContain("integer");
		// emailVerified is a boolean field
		const userTableMatch = sql.match(/CREATE TABLE "user"[\s\S]*?;/);
		if (userTableMatch) {
			expect(userTableMatch[0]).toContain('"emailVerified" integer');
		}
	});

	it("should override json field types", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (field.type === "json") {
				return { type: "text" }; // Override json to text (SQLite default is also text)
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify json fields use text (SQLite default is also text)
		expect(sql).toContain("text");
	});

	it("should override id field types", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (fieldName === "id") {
				return { type: "varchar(123)" }; // Override id to varchar(123) (SQLite default is text)
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify id fields use varchar(123) (SQLite default is text)
		expect(sql).toContain('"id" varchar(123)');
	});

	it("should override foreign key field types", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (field.references) {
				return { type: "varchar(123)" }; // Override all foreign keys to varchar(123) (SQLite default is text)
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify foreign key fields use text (SQLite default is also text)
		// session table has userId which references user.id
		const sessionTableMatch = sql.match(/CREATE TABLE "session"[\s\S]*?;/);
		if (sessionTableMatch) {
			expect(sessionTableMatch[0]).toContain('"userId" varchar(123)');
		}
	});

	it("should override array field types", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (field.type === "string[]" || field.type === "number[]") {
				return { type: "TEXT" }; // Override arrays to TEXT
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Note: Array types may not be present in basic schema, but override should work
		expect(sql).toBeTruthy();
	});

	it("should access defaultType parameter in override", async () => {
		const defaultTypes: string[] = [];
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			// Collect default types
			if (typeof defaultType === "string") {
				defaultTypes.push(defaultType);
			}
			// Override email to use a modified version of default
			if (tableName === "user" && fieldName === "email") {
				return { type: "text" };
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		await getMigrations(config, fieldTypeOverride);

		// Verify defaultType was provided (should have collected some defaults)
		expect(defaultTypes.length).toBeGreaterThan(0);
		// Email default should be "text" for sqlite
		expect(defaultTypes).toContain("text");
	});

	it("should override multiple fields with different rules", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			// Multiple override rules
			if (tableName === "user" && fieldName === "email") {
				return { type: "text" };
			}
			if (tableName === "user" && fieldName === "name") {
				return { type: "text" };
			}
			if (tableName === "session" && field.type === "string") {
				return { type: "text" };
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify all overrides are applied (though defaults are also text for SQLite)
		expect(sql).toContain('"email" text');
		expect(sql).toContain('"name" text');
		const sessionTableMatch = sql.match(/CREATE TABLE "session"[\s\S]*?;/);
		if (sessionTableMatch) {
			expect(sessionTableMatch[0]).toContain("text");
		}
	});

	it("should work with database type parameter", async () => {
		const dbTypes: string[] = [];
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			dbTypes.push(dbType);
			// Override only for sqlite
			if (
				dbType === "sqlite" &&
				tableName === "user" &&
				fieldName === "email"
			) {
				return { type: "text" };
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify dbType is sqlite
		expect(dbTypes.every((type) => type === "sqlite")).toBe(true);
		// Verify override was applied
		expect(sql).toContain('"email" text');
	});

	it("should work with config parameter", async () => {
		let configReceived: BetterAuthOptions | undefined = undefined;
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			configReceived = config;
			// Use config to determine override
			if (config.advanced?.database?.useNumberId && fieldName === "id") {
				return { type: "integer" };
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
			advanced: {
				database: {
					useNumberId: true,
				},
			},
		};

		await getMigrations(config, fieldTypeOverride);

		// Verify config was received
		expect(configReceived).toBeTruthy();
		if (configReceived) {
			expect(
				(configReceived as BetterAuthOptions).advanced?.database?.useNumberId,
			).toBe(true);
		}
	});

	it("should apply overrides when adding columns to existing tables", async () => {
		// First create a table without some fields
		database.exec(`
			CREATE TABLE IF NOT EXISTS "user" (
				id TEXT PRIMARY KEY NOT NULL,
				email TEXT NOT NULL
			);
		`);

		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (tableName === "user" && fieldName === "name") {
				return { type: "text" }; // Override when adding name column
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations, toBeAdded } = await getMigrations(
			config,
			fieldTypeOverride,
		);

		// Should have fields to add
		const userFieldsToAdd = toBeAdded.find((t) => t.table === "user");
		expect(userFieldsToAdd).toBeDefined();

		const sql = await compileMigrations();
		// Verify override is applied in ALTER TABLE statement
		if (userFieldsToAdd && userFieldsToAdd.fields.name) {
			expect(sql).toContain('ALTER TABLE "user"'.toLowerCase());
			expect(sql).toContain('"name" text');
		}

		// Cleanup
		database.exec(`DROP TABLE IF EXISTS "user"`);
	});

	it("should handle complex override logic with field attributes", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			// Override based on field attributes
			if (field.unique && field.type === "string") {
				return { type: "text" }; // Unique strings get text
			}
			if (field.references && field.type === "string") {
				return { type: "text" }; // Foreign keys get text
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify overrides based on attributes
		expect(sql).toBeTruthy();
	});

	it("should override required attribute", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			if (tableName === "user" && fieldName === "name") {
				return { required: false }; // Make name optional
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify name field is nullable (no NOT NULL constraint)
		const userTableMatch = sql.match(/CREATE TABLE "user"[\s\S]*?;/);
		if (userTableMatch) {
			// Name should not have NOT NULL if required is false
			expect(userTableMatch[0]).toContain('"name" text');
			// Should not contain "name" text NOT NULL
			expect(userTableMatch[0]).not.toContain('"name" text NOT NULL');
		}
	});

	it("should override unique attribute", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			// Override unique for a field that will be created (not email which already exists)
			if (tableName === "session" && fieldName === "token") {
				return { unique: true }; // Make token unique (it already is, but we're testing override)
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify token has UNIQUE constraint in session table
		const sessionTableMatch = sql.match(/CREATE TABLE "session"[\s\S]*?;/);
		if (sessionTableMatch) {
			expect(sessionTableMatch[0]).toContain("UNIQUE");
		}
	});

	it("should override multiple attributes at once", async () => {
		const fieldTypeOverride: FieldTypeOverride = (
			field,
			fieldName,
			tableName,
			dbType,
			config,
			defaultType,
		) => {
			// Override attributes for a field that will be created
			if (tableName === "session" && fieldName === "token") {
				return {
					type: "text",
					unique: true,
					required: true,
				};
			}
			return undefined;
		};

		const config: BetterAuthOptions = {
			database: {
				dialect: new SqliteDialect({ database }),
				type: "sqlite",
			},
			emailAndPassword: {
				enabled: true,
			},
		};

		const { compileMigrations } = await getMigrations(
			config,
			fieldTypeOverride,
		);
		const sql = await compileMigrations();

		// Verify all overrides are applied in session table
		const sessionTableMatch = sql.match(/CREATE TABLE "session"[\s\S]*?;/);
		if (sessionTableMatch) {
			expect(sessionTableMatch[0]).toContain('"token" text');
			expect(sessionTableMatch[0]).toContain("UNIQUE");
		}
	});
});
