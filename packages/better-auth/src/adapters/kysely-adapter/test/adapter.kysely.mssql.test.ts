import type { BetterAuthOptions } from "@better-auth/core";
import { Kysely, MssqlDialect } from "kysely";
import * as Tarn from "tarn";
import * as Tedious from "tedious";
import { getMigrations } from "../../../db";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	joinsTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	transactionsTestSuite,
	uuidTestSuite,
} from "../../tests";
import { kyselyAdapter } from "../kysely-adapter";

// We are not allowed to handle the mssql connection
// we must let kysely handle it. This is because if kysely is already
// handling it, and we were to connect it ourselves, it will create bugs.

// Helper function to create a connection factory for a specific database
const createConnectionFactory = (database: string) => () =>
	new Tedious.Connection({
		authentication: {
			options: {
				password: "Password123!",
				userName: "sa",
			},
			type: "default",
		},
		options: {
			database: database,
			port: 1433,
			trustServerCertificate: true,
			encrypt: false,
			connectTimeout: 30000,
			requestTimeout: 30000,
		},
		server: "localhost",
	});

// Create better_auth database if it doesn't exist
// We need to connect to 'master' database first since 'better_auth' may not exist yet
const ensureDatabaseExists = async () => {
	try {
		// console.log("Ensuring better_auth database exists...");
		// Create a temporary connection to 'master' database to create 'better_auth'
		const masterDialect = new MssqlDialect({
			tarn: {
				...Tarn,
				options: {
					min: 0,
					max: 5,
				},
			},
			tedious: {
				...Tedious,
				connectionFactory: createConnectionFactory("master"),
				TYPES: {
					...Tedious.TYPES,
					DateTime: Tedious.TYPES.DateTime2,
				},
			},
		});

		const masterDB = new Kysely({
			dialect: masterDialect,
		});

		await masterDB.getExecutor().executeQuery({
			sql: `
				IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'better_auth')
				BEGIN
					CREATE DATABASE better_auth;
					PRINT 'Database better_auth created successfully';
				END
				ELSE
				BEGIN
					PRINT 'Database better_auth already exists';
				END
			`,
			parameters: [],
			query: { kind: "SelectQueryNode" },
			queryId: { queryId: "ensure-db" },
		});

		await masterDB.destroy();
		// console.log("Database check/creation completed");
	} catch (error) {
		console.error("Failed to ensure database exists:", error);
		throw error;
	}
};

// Create dialect for better_auth database (after ensuring it exists)
const dialect = new MssqlDialect({
	tarn: {
		...Tarn,
		options: {
			min: 0,
			max: 50,
		},
	},
	tedious: {
		...Tedious,
		connectionFactory: createConnectionFactory("better_auth"),
		TYPES: {
			...Tedious.TYPES,
			DateTime: Tedious.TYPES.DateTime2,
		},
	},
});

const kyselyDB = new Kysely({
	dialect: dialect,
});

// Warm up connection for CI environments
const warmupConnection = async () => {
	const isCI =
		process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
	if (isCI) {
		try {
			await ensureDatabaseExists();

			// Try a simple query to establish the connection
			await kyselyDB.getExecutor().executeQuery({
				sql: "SELECT 1 as warmup, @@VERSION as version",
				parameters: [],
				query: { kind: "SelectQueryNode" },
				queryId: { queryId: "warmup" },
			});
		} catch (error) {
			console.warn(
				"Connection warmup failed, will retry during validation:",
				error,
			);
			// Log additional debugging info for CI
			if (isCI) {
				console.log("CI Debug Info:");
				console.log("- MSSQL server may not be ready yet");
				console.log("- Network connectivity issues possible");
				console.log("- Database may not exist yet");
			}
		}
	} else {
		// For local development, also ensure database exists
		await ensureDatabaseExists();
	}
};

// Add connection validation helper with CI-specific handling
const validateConnection = async (retries: number = 10): Promise<boolean> => {
	const isCI =
		process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
	const maxRetries = isCI ? 15 : retries; // More retries in CI
	const baseDelay = isCI ? 2000 : 1000; // Longer delays in CI

	for (let i = 0; i < maxRetries; i++) {
		try {
			await query("SELECT 1 as test", isCI ? 10000 : 5000);
			// console.log("Connection validated successfully");
			return true;
		} catch (error) {
			console.warn(
				`Connection validation attempt ${i + 1}/${maxRetries} failed:`,
				error,
			);
			if (i === maxRetries - 1) {
				console.error("All connection validation attempts failed");
				return false;
			}
			// Exponential backoff with longer delays in CI
			const delay = baseDelay * Math.pow(1.5, i);
			console.log(`Waiting ${delay}ms before retry...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
	return false;
};

const query = async (sql: string, timeoutMs: number = 30000) => {
	const isCI =
		process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
	const actualTimeout = isCI ? Math.max(timeoutMs, 60000) : timeoutMs; // Minimum 60s timeout in CI

	try {
		// Ensure we're using the better_auth database for queries
		const sqlWithContext = sql.includes("USE ")
			? sql
			: `USE better_auth; ${sql}`;

		const result = (await Promise.race([
			kyselyDB.getExecutor().executeQuery({
				sql: sqlWithContext,
				parameters: [],
				query: { kind: "SelectQueryNode" },
				queryId: { queryId: "" },
			}),
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error(`Query timeout after ${actualTimeout}ms`)),
					actualTimeout,
				),
			),
		])) as any;
		return { rows: result.rows, rowCount: result.rows.length };
	} catch (error) {
		console.error(`Query failed: ${error}`);
		throw error;
	}
};

const showDB = async () => {
	const tables = await query(`SELECT TABLE_NAME, TABLE_SCHEMA 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME;`);

	console.log("Available tables:", tables);

	const DB = {
		user: await query("SELECT * FROM [user]"),
		session: await query("SELECT * FROM [session]"),
		account: await query("SELECT * FROM [account]"),
		verification: await query("SELECT * FROM [verification]"),
	};
	console.log(`DB`, DB);
};

const resetDB = async (retryCount: number = 0) => {
	const isCI =
		process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
	const maxRetries = isCI ? 3 : 1; // Allow retries in CI

	try {
		// Warm up connection first (especially important for CI)
		await warmupConnection();

		const isConnected = await validateConnection();
		if (!isConnected) {
			throw new Error("Database connection validation failed");
		}

		// First, try to disable foreign key checks and drop constraints
		await query(
			`
			-- Disable all foreign key constraints
			EXEC sp_MSforeachtable "ALTER TABLE ? NOCHECK CONSTRAINT all";
		`,
			15000,
		);

		// Drop foreign key constraints
		await query(
			`
			DECLARE @sql NVARCHAR(MAX) = '';
			SELECT @sql = @sql + 'ALTER TABLE [' + TABLE_SCHEMA + '].[' + TABLE_NAME + '] DROP CONSTRAINT [' + CONSTRAINT_NAME + '];' + CHAR(13)
			FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
			WHERE CONSTRAINT_TYPE = 'FOREIGN KEY'
			AND TABLE_CATALOG = DB_NAME();
			IF LEN(@sql) > 0
				EXEC sp_executesql @sql;
		`,
			15000,
		);

		// Then drop all tables
		await query(
			`
			DECLARE @sql NVARCHAR(MAX) = '';
			SELECT @sql = @sql + 'DROP TABLE [' + TABLE_NAME + '];' + CHAR(13)
			FROM INFORMATION_SCHEMA.TABLES 
			WHERE TABLE_TYPE = 'BASE TABLE' 
			AND TABLE_CATALOG = DB_NAME()
			AND TABLE_SCHEMA = 'dbo';
			IF LEN(@sql) > 0
				EXEC sp_executesql @sql;
		`,
			15000,
		);
	} catch (error) {
		console.error("Database reset failed:", error);

		// Retry logic for CI environments
		if (retryCount < maxRetries) {
			const delay = 5000 * (retryCount + 1); // Increasing delay
			console.log(
				`Retrying in ${delay}ms... (attempt ${retryCount + 2}/${maxRetries + 1})`,
			);
			await new Promise((resolve) => setTimeout(resolve, delay));
			return resetDB(retryCount + 1);
		}

		// Final fallback - try to recreate the database
		try {
			// This would require a separate connection to master database
			// For now, just throw the error with better context
			throw new Error(`Database reset failed completely: ${error}`);
		} catch (finalError) {
			console.error("Final fallback also failed:", finalError);
			throw new Error(
				`Database reset failed: ${error}. All fallback attempts failed: ${finalError}`,
			);
		}
	}
};

const { execute } = await testAdapter({
	adapter: () => {
		return kyselyAdapter(kyselyDB, {
			type: "mssql",
			debugLogs: { isRunningAdapterTests: true },
		});
	},
	async runMigrations(betterAuthOptions) {
		console.log(`Starting MSSQL migrations`);
		await resetDB();
		console.log(`Finished resetting MSSQL database`);
		const opts = Object.assign(betterAuthOptions, {
			database: { db: kyselyDB, type: "mssql" },
		} satisfies BetterAuthOptions);
		console.log(`Running MSSQL migrations`);
		const { runMigrations, compileMigrations } = await getMigrations(opts);
		const CI =
			process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
		// Helpful for debugging mssql environment issues on Github actions
		if (CI) {
			console.log(`Compiling MSSQL migrations`);
			const migrations = await compileMigrations();
			console.log(`Migrations:`, migrations);
		}
		await runMigrations();
		console.log(`Finished running MSSQL migrations`);
	},
	prefixTests: "mssql",
	tests: [
		normalTestSuite({
			async showDB() {
				await showDB();
			},
		}),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite({ showDB }),
		numberIdTestSuite(),
		joinsTestSuite(),
		uuidTestSuite(),
	],
	async onFinish() {
		kyselyDB.destroy();
	},
});
execute();
