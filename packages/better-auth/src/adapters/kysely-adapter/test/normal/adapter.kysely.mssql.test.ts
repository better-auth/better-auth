import { Kysely, MssqlDialect } from "kysely";
import { testAdapter } from "../../../test-adapter";
import { kyselyAdapter } from "../../kysely-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../../tests";
import { getMigrations } from "../../../../db";
import * as Tedious from "tedious";
import * as Tarn from "tarn";
import type { BetterAuthOptions } from "../../../../types";
import { waitUntilTestsAreDone } from "../../../../test/adapter-test-setup";

const { done } = await waitUntilTestsAreDone({
	thisTest: "kysely-mssql",
	waitForTests: [],
});

// Create MSSQL connection factory
const createMssqlConnection = (database: string) => {
	return new Tedious.Connection({
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
		},
		server: "localhost",
	});
};

// Create master database helper
const createMasterDB = (connection: Tedious.Connection) => ({
	request: () => ({
		query: async (sql: string) => {
			return new Promise((resolve, reject) => {
				const request = new Tedious.Request(sql, (err, rowCount, rows) => {
					if (err) {
						reject(err);
					} else {
						resolve({ recordset: rows });
					}
				});
				connection.execSql(request);
			});
		},
	}),
	close: async () => {
		await closeConnection(connection);
	},
});

let kyselyDB: Kysely<any> | null = null;
let betterAuthDB: any = null;
let betterAuthConnection: Tedious.Connection | null = null;

// Initialize the database connection
const initializeDatabase = async () => {
	if (kyselyDB) {
		return; // Already initialized
	}

	try {
		// Create master connection for setup
		const masterConnection = createMssqlConnection("master");
		await connectToDatabase(masterConnection, "master");

		// Create the better_auth database
		const masterDB = createMasterDB(masterConnection);
		await masterDB.request().query("DROP DATABASE IF EXISTS better_auth");
		await masterDB.request().query("CREATE DATABASE better_auth");

		// Close master connection
		await closeConnection(masterConnection);

		// Create connection to better_auth database
		betterAuthConnection = createMssqlConnection("better_auth");
		await connectToDatabase(betterAuthConnection, "better_auth");

		// Create Kysely database with the actual connection
		kyselyDB = new Kysely({
			dialect: new MssqlDialect({
				tarn: {
					...Tarn,
					options: {
						min: 0,
						max: 10,
					},
				},
				tedious: {
					...Tedious,
					connectionFactory: () => betterAuthConnection!,
				},
			}),
		});

		// Create betterAuthDB for direct queries
		betterAuthDB = {
			request: () => ({
				query: async (sql: string) => {
					return new Promise((resolve, reject) => {
						const request = new Tedious.Request(sql, (err, rowCount, rows) => {
							if (err) {
								reject(err);
							} else {
								resolve({ recordset: rows });
							}
						});
						betterAuthConnection!.execSql(request);
					});
				},
			}),
			close: async () => {
				await closeConnection(betterAuthConnection);
			},
		};
	} catch (error) {
		console.error("Database initialization error:", error);
		throw error;
	}
};

// Helper function to safely connect to a database
const connectToDatabase = async (connection: Tedious.Connection, databaseName: string): Promise<void> => {
	return new Promise<void>((resolve, reject) => {
		// If already connected, resolve immediately
		if (connection.state === connection.STATE.LOGGED_IN) {
			resolve();
			return;
		}

		// If connection is in final state, it's closed - reject
		if (connection.state === connection.STATE.FINAL) {
			reject(new Error(`Connection to ${databaseName} is closed and cannot be reused`));
			return;
		}

		// Set up event handlers
		const onConnect = (err: Error | null) => {
			connection.removeListener('connect', onConnect as any);
			connection.removeListener('end', onEnd as any);
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		};

		const onEnd = () => {
			connection.removeListener('connect', onConnect as any);
			connection.removeListener('end', onEnd as any);
			reject(new Error(`Connection to ${databaseName} ended unexpectedly`));
		};

		connection.on('connect', onConnect as any);
		connection.on('end', onEnd as any);

		// Connect if not already connecting
		if (connection.state === connection.STATE.INITIALIZED) {
			connection.connect();
		} else if (connection.state === connection.STATE.CONNECTING) {
			// Already connecting, just wait
		} else {
			connection.removeListener('connect', onConnect);
			connection.removeListener('end', onEnd);
			reject(new Error(`Connection to ${databaseName} in invalid state: ${connection.state}`));
		}
	});
};

// Helper function to safely close a connection
const closeConnection = async (connection: Tedious.Connection | null): Promise<void> => {
	if (!connection) return;
	
	return new Promise<void>((resolve) => {
		if (connection.state === connection.STATE.FINAL) {
			resolve();
			return;
		}

		connection.on('end', () => resolve() as any);
		connection.close();
	});
};

const showDB = async () => {
	if (!betterAuthDB) {
		console.log("Database not connected yet");
		return;
	}
	const q = async (s: string) => {
		const result = (await betterAuthDB.request().query(s)) as {
			recordset: any[];
		};
		return result.recordset;
	};
	const DB = {
		users: await q("SELECT * FROM [user]"),
		sessions: await q("SELECT * FROM [session]"),
		accounts: await q("SELECT * FROM [account]"),
		verifications: await q("SELECT * FROM [verification]"),
	};
	console.log(`DB`, DB);
};

const { execute } = testAdapter({
	adapter: () => {
		if (!kyselyDB) {
			// Initialize synchronously if not already done
			throw new Error("Database not initialized. This should not happen as initializeDatabase should be called first.");
		}
		return kyselyAdapter(kyselyDB, { type: "mssql" });
	},
	async runMigrations(betterAuthOptions) {
		try {
			// Ensure database is initialized
			await initializeDatabase();

			if (!kyselyDB) {
				throw new Error("Database not initialized");
			}

			// Run migrations
			const opts = Object.assign(betterAuthOptions, {
				database: { db: kyselyDB, type: "mssql" },
			} satisfies BetterAuthOptions);
			const { runMigrations } = await getMigrations(opts);
			await runMigrations();
		} catch (error) {
			console.error("Migration error:", error);
			throw error;
		}
	},
	prefixTests: "mssql",
	tests: [
		normalTestSuite({
			showDB,
			async testFn() {
				if (!betterAuthDB) {
					console.log("Database not connected yet");
					return;
				}
				const result = (await betterAuthDB
					.request()
					.query("SELECT * FROM [user]")) as { recordset: any[] };
				console.log(result.recordset);
			},
			// disableTests: { ALL: true, "create - should create a model": false },
		}),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite({ showDB }),
		performanceTestSuite({ dialect: "mssql" }),
	],
	async onFinish() {
		// Clean up all connections
		await closeConnection(betterAuthConnection);
		kyselyDB = null;
		betterAuthDB = null;
		betterAuthConnection = null;
		await done();
	},
});

execute();
