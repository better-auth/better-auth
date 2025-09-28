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

const query = async (sql: string) => {
	const result = await kyselyDB.getExecutor().executeQuery({
		sql,
		parameters: [],
		query: { kind: "SelectQueryNode" },
		queryId: { queryId: "" },
	});
	return { rows: result.rows, rowCount: result.rows.length };
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
	// First, drop all foreign key constraints
	await query(`
		DECLARE @sql NVARCHAR(MAX) = '';
		SELECT @sql = @sql + 'ALTER TABLE [' + TABLE_SCHEMA + '].[' + TABLE_NAME + '] DROP CONSTRAINT [' + CONSTRAINT_NAME + '];' + CHAR(13)
		FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
		WHERE CONSTRAINT_TYPE = 'FOREIGN KEY'
		AND TABLE_CATALOG = DB_NAME();
		EXEC sp_executesql @sql;
	`);

	// Then drop all tables
	await query(`
		DECLARE @sql NVARCHAR(MAX) = '';
		SELECT @sql = @sql + 'DROP TABLE [' + TABLE_NAME + '];' + CHAR(13)
		FROM INFORMATION_SCHEMA.TABLES 
		WHERE TABLE_TYPE = 'BASE TABLE' 
		AND TABLE_CATALOG = DB_NAME()
		AND TABLE_SCHEMA = 'dbo';
		EXEC sp_executesql @sql;
	`);
};

const { execute } = await testAdapter({
	adapter: () => {
		return kyselyAdapter(kyselyDB, {
			type: "mssql",
			debugLogs: { isRunningAdapterTests: true },
		});
	},
	async runMigrations(betterAuthOptions) {
		console.time(`stage 1`)
		await resetDB();
		console.timeEnd(`stage 1`)
		console.time(`stage 2`)
		const opts = Object.assign(betterAuthOptions, {
			database: { db: kyselyDB, type: "mssql" },
		} satisfies BetterAuthOptions);
		console.timeEnd(`stage 2`)
		console.time(`stage 3`)
		const { runMigrations } = await getMigrations(opts);
		console.timeEnd(`stage 3`)
		console.time(`stage 4`)
		await runMigrations();
		console.timeEnd(`stage 4`)
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
