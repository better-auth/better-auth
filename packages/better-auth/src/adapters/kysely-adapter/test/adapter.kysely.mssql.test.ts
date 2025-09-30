import { Kysely, MssqlDialect } from "kysely";
import { testAdapter } from "../../test-adapter";
import { kyselyAdapter } from "../kysely-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { getMigrations } from "../../../db";
import * as Tedious from "tedious";
import * as Tarn from "tarn";
import type { BetterAuthOptions } from "../../../types";

// We are not allowed to handle the mssql connection
// we must let kysely handle it. This is because if kysely is already
// handling it, and we were to connect it ourselves, it will create bugs.
const dialect = new MssqlDialect({
	tarn: {
		...Tarn,
		options: {
			min: 0,
			max: 10,
		},
	},
	tedious: {
		...Tedious,
		connectionFactory: () =>
			new Tedious.Connection({
				authentication: {
					options: {
						password: "Password123!",
						userName: "sa",
					},
					type: "default",
				},
				options: {
					database: "master", // Start with master database, will create better_auth if needed
					port: 1433,
					trustServerCertificate: true,
					encrypt: false,
				},
				server: "localhost",
			}),
		TYPES: {
			...Tedious.TYPES,
			DateTime: Tedious.TYPES.DateTime2,
		},
	},
});

const kyselyDB = new Kysely({
	dialect: dialect,
});

// Create better_auth database if it doesn't exist
const ensureDatabaseExists = async () => {
	try {
		console.log("Ensuring better_auth database exists...");
		await kyselyDB.getExecutor().executeQuery({
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
		console.log("Database check/creation completed");
	} catch (error) {
		console.error("Failed to ensure database exists:", error);
		throw error;
	}
};

// Warm up connection for CI environments
const warmupConnection = async () => {
	const isCI =
		process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
	if (isCI) {
		console.log("Warming up MSSQL connection for CI environment...");
		console.log(
			`Environment: CI=${process.env.CI}, GITHUB_ACTIONS=${process.env.GITHUB_ACTIONS}`,
		);

		try {
			await ensureDatabaseExists();

			// Try a simple query to establish the connection
			await kyselyDB.getExecutor().executeQuery({
				sql: "SELECT 1 as warmup, @@VERSION as version",
				parameters: [],
				query: { kind: "SelectQueryNode" },
				queryId: { queryId: "warmup" },
			});
			console.log("Connection warmup successful");
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

	console.log(
		`Validating connection (CI: ${isCI}, max retries: ${maxRetries})`,
	);

	for (let i = 0; i < maxRetries; i++) {
		try {
			await query("SELECT 1 as test", isCI ? 10000 : 5000);
			console.log("Connection validated successfully");
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
		console.log(
			`Executing SQL: ${sql.substring(0, 100)}... (timeout: ${actualTimeout}ms, CI: ${isCI})`,
		);

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
		console.log(`Query completed successfully`);
		return { rows: result.rows, rowCount: result.rows.length };
	} catch (error) {
		console.error(`Query failed: ${error}`);
		throw error;
	}
};

const showDB = async () => {
	const DB = {
		users: await query("SELECT * FROM [user]"),
		sessions: await query("SELECT * FROM [session]"),
		accounts: await query("SELECT * FROM [account]"),
		verifications: await query("SELECT * FROM [verification]"),
	};
	console.log(`DB`, DB);
};

const resetDB = async (retryCount: number = 0) => {
	const isCI =
		process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
	const maxRetries = isCI ? 3 : 1; // Allow retries in CI

	try {
		console.log(
			`Starting database reset... (attempt ${retryCount + 1}/${maxRetries + 1})`,
		);

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

		console.log("Database reset completed successfully");
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
			console.log("Attempting database recreation...");
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
		await resetDB();
		const opts = Object.assign(betterAuthOptions, {
			database: { db: kyselyDB, type: "mssql" },
		} satisfies BetterAuthOptions);
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	},
	prefixTests: "mssql",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite({ showDB }),
		numberIdTestSuite(),
		performanceTestSuite({ dialect: "mssql" }),
	],
	async onFinish() {
		kyselyDB.destroy();
	},
});
execute();
