import { Kysely, MssqlDialect } from "kysely";
import { testAdapter } from "../../test-adapter";
import { kyselyAdapter } from "../kysely-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { getMigrations } from "../../../db";
import * as Tedious from "tedious";
import * as Tarn from "tarn";
import type { BetterAuthOptions } from "../../../types";
import { waitForTestPermission } from "../../../test/adapter-test-setup";

const { done } = await waitForTestPermission("kysely-mssql");

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
					database: "better_auth",
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

// Add connection validation helper
const validateConnection = async (retries: number = 3): Promise<boolean> => {
	for (let i = 0; i < retries; i++) {
		try {
			await query("SELECT 1 as test", 5000);
			console.log("Connection validated successfully");
			return true;
		} catch (error) {
			console.warn(`Connection validation attempt ${i + 1} failed:`, error);
			if (i === retries - 1) {
				console.error("All connection validation attempts failed");
				return false;
			}
			// Wait before retry
			await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
		}
	}
	return false;
};

const query = async (sql: string, timeoutMs: number = 30000) => {
	try {
		console.log(`Executing SQL: ${sql.substring(0, 100)}...`);
		const result = (await Promise.race([
			kyselyDB.getExecutor().executeQuery({
				sql,
				parameters: [],
				query: { kind: "SelectQueryNode" },
				queryId: { queryId: "" },
			}),
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error(`Query timeout after ${timeoutMs}ms`)),
					timeoutMs,
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

const resetDB = async () => {
	try {
		console.log("Starting database reset...");

		// Validate connection before proceeding
		const isConnected = await validateConnection();
		if (!isConnected) {
			throw new Error("Database connection validation failed");
		}

		// First, try to disable foreign key checks and drop constraints
		console.log("Dropping foreign key constraints...");
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
		console.log("Dropping tables...");
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
		console.time(`stage 1`);
		await resetDB();
		console.timeEnd(`stage 1`);
		console.time(`stage 2`);
		const opts = Object.assign(betterAuthOptions, {
			database: { db: kyselyDB, type: "mssql" },
		} satisfies BetterAuthOptions);
		console.timeEnd(`stage 2`);
		console.time(`stage 3`);
		const { runMigrations } = await getMigrations(opts);
		console.timeEnd(`stage 3`);
		console.time(`stage 4`);
		await runMigrations();
		console.timeEnd(`stage 4`);
	},
	prefixTests: "mssql",
	tests: [
		normalTestSuite({
			showDB,
		}),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite({ showDB }),
		performanceTestSuite({ dialect: "mssql" }),
	],
	async onFinish() {
		kyselyDB.destroy();
		await done();
	},
});
execute();
