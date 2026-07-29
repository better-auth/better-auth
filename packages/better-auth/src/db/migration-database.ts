import type { BetterAuthOptions } from "@better-auth/core";
import type {
	MigrationDatabaseConnection,
	MigrationDatabaseDialect,
} from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import type { KyselyDatabaseType } from "@better-auth/kysely-adapter";
import { createKyselyAdapter } from "@better-auth/kysely-adapter";
import type {
	DatabaseConnection,
	DatabaseIntrospector,
	Dialect,
	DialectAdapter,
	Driver,
	QueryCompiler,
} from "kysely";
import {
	CompiledQuery,
	Kysely,
	MssqlAdapter,
	MssqlIntrospector,
	MssqlQueryCompiler,
	MysqlAdapter,
	MysqlIntrospector,
	MysqlQueryCompiler,
	PostgresAdapter,
	PostgresIntrospector,
	PostgresQueryCompiler,
	SqliteAdapter,
	SqliteIntrospector,
	SqliteQueryCompiler,
} from "kysely";
import { getAdapter } from "./adapter-kysely";

export interface MigrationDatabase {
	adapterId: string;
	databaseType: KyselyDatabaseType;
	inTransaction: boolean;
	kysely: Kysely<unknown>;
	transaction?:
		| (<Result>(
				callback: (database: MigrationDatabase) => Promise<Result>,
		  ) => Promise<Result>)
		| undefined;
}

function createDatabaseConnection(
	migrationConnection: MigrationDatabaseConnection,
): DatabaseConnection {
	return {
		async executeQuery<R>(compiledQuery: CompiledQuery) {
			const queryResult = await migrationConnection.execute({
				parameters: compiledQuery.parameters,
				sql: compiledQuery.sql,
			});
			return {
				...queryResult,
				rows: [...queryResult.rows] as R[],
			};
		},
		async *streamQuery() {
			throw new BetterAuthError("Migration query streaming is not supported.");
		},
	};
}

function createMigrationDriver(
	migrationConnection: MigrationDatabaseConnection,
): Driver {
	const databaseConnection = createDatabaseConnection(migrationConnection);
	const executeTransactionStatement = async (
		connection: DatabaseConnection,
		sql: string,
	) => {
		await connection.executeQuery(CompiledQuery.raw(sql));
	};
	return {
		async init() {},
		async acquireConnection() {
			return databaseConnection;
		},
		async beginTransaction(connection) {
			await executeTransactionStatement(
				connection,
				migrationConnection.dialect === "mssql" ? "BEGIN TRANSACTION" : "BEGIN",
			);
		},
		async commitTransaction(connection) {
			await executeTransactionStatement(
				connection,
				migrationConnection.dialect === "mssql"
					? "COMMIT TRANSACTION"
					: "COMMIT",
			);
		},
		async rollbackTransaction(connection) {
			await executeTransactionStatement(
				connection,
				migrationConnection.dialect === "mssql"
					? "ROLLBACK TRANSACTION"
					: "ROLLBACK",
			);
		},
		async releaseConnection() {},
		async destroy() {},
	};
}

function createDialectAdapter(
	dialect: MigrationDatabaseDialect,
): DialectAdapter {
	if (dialect === "postgres") return new PostgresAdapter();
	if (dialect === "mysql") return new MysqlAdapter();
	if (dialect === "mssql") return new MssqlAdapter();
	return new SqliteAdapter();
}

function createQueryCompiler(dialect: MigrationDatabaseDialect): QueryCompiler {
	if (dialect === "postgres") return new PostgresQueryCompiler();
	if (dialect === "mysql") return new MysqlQueryCompiler();
	if (dialect === "mssql") return new MssqlQueryCompiler();
	return new SqliteQueryCompiler();
}

function createDatabaseIntrospector(
	dialect: MigrationDatabaseDialect,
	database: Kysely<unknown>,
): DatabaseIntrospector {
	if (dialect === "postgres") return new PostgresIntrospector(database);
	if (dialect === "mysql") return new MysqlIntrospector(database);
	if (dialect === "mssql") return new MssqlIntrospector(database);
	return new SqliteIntrospector(database);
}

function createMigrationDialect(
	migrationConnection: MigrationDatabaseConnection,
): Dialect {
	return {
		createAdapter() {
			return createDialectAdapter(migrationConnection.dialect);
		},
		createDriver() {
			return createMigrationDriver(migrationConnection);
		},
		createIntrospector(database) {
			return createDatabaseIntrospector(migrationConnection.dialect, database);
		},
		createQueryCompiler() {
			return createQueryCompiler(migrationConnection.dialect);
		},
	};
}

export async function getMigrationDatabase(config: BetterAuthOptions) {
	const directDatabase = await createKyselyAdapter(config);
	if (directDatabase.kysely && directDatabase.databaseType) {
		const database: MigrationDatabase = {
			adapterId: "kysely",
			databaseType: directDatabase.databaseType,
			inTransaction: false,
			kysely: directDatabase.kysely,
		};
		database.transaction = async (callback) =>
			directDatabase.kysely!.transaction().execute((transaction) =>
				callback({
					adapterId: database.adapterId,
					databaseType: database.databaseType,
					inTransaction: true,
					kysely: transaction as unknown as Kysely<unknown>,
				}),
			);
		return database;
	}

	if (directDatabase.kysely) {
		throw new BetterAuthError(
			"Migrations cannot determine the SQL dialect of the configured database. Declare it with the `database: { dialect, type }` configuration form.",
		);
	}

	const adapter = await getAdapter(config);
	const migrationConnection =
		adapter.options?.adapterConfig.migrationConnection;
	if (!migrationConnection) {
		throw new BetterAuthError(
			`The ${adapter.id} adapter does not expose a SQL migration connection. Use \`auth generate\` and your database tooling instead.`,
		);
	}
	const createDatabase = (
		connection: MigrationDatabaseConnection,
		inTransaction: boolean,
	): MigrationDatabase => {
		const database: MigrationDatabase = {
			adapterId: adapter.id,
			databaseType: connection.dialect,
			inTransaction,
			kysely: new Kysely<unknown>({
				dialect: createMigrationDialect(connection),
			}),
		};
		if (!inTransaction && connection.transaction) {
			database.transaction = async (callback) =>
				connection.transaction!((transactionConnection) =>
					callback(createDatabase(transactionConnection, true)),
				);
		}
		return database;
	};
	return createDatabase(migrationConnection, false);
}
