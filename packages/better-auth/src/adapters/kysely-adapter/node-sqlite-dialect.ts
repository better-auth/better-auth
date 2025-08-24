/**
 * @see {@link https://nodejs.org/api/sqlite.html} - Node.js SQLite API documentation
 */
import {
	Kysely,
	CompiledQuery,
	DEFAULT_MIGRATION_LOCK_TABLE,
	DEFAULT_MIGRATION_TABLE,
	sql,
	type DatabaseConnection,
	type QueryResult,
	type DatabaseIntrospector,
	type SchemaMetadata,
	type DatabaseMetadataOptions,
	type TableMetadata,
	type DatabaseMetadata,
	type Driver,
	type Dialect,
	type QueryCompiler,
	type DialectAdapter,
} from "kysely";
import { DefaultQueryCompiler } from "kysely";
import { DialectAdapterBase } from "kysely";
import type { DatabaseSync } from "node:sqlite";

export class NodeSqliteAdapter implements DialectAdapterBase {
	get supportsCreateIfNotExists(): boolean {
		return true;
	}

	get supportsTransactionalDdl(): boolean {
		return false;
	}

	get supportsReturning(): boolean {
		return true;
	}

	async acquireMigrationLock(): Promise<void> {
		// SQLite only has one connection that's reserved by the migration system
		// for the whole time between acquireMigrationLock and releaseMigrationLock.
		// We don't need to do anything here.
	}

	async releaseMigrationLock(): Promise<void> {
		// SQLite only has one connection that's reserved by the migration system
		// for the whole time between acquireMigrationLock and releaseMigrationLock.
		// We don't need to do anything here.
	}
	get supportsOutput(): boolean {
		return true;
	}
}

/**
 * Config for the SQLite dialect.
 */
export interface NodeSqliteDialectConfig {
	/**
	 * A sqlite DatabaseSync instance or a function that returns one.
	 */
	database: DatabaseSync;

	/**
	 * Called once when the first query is executed.
	 */
	onCreateConnection?: (connection: DatabaseConnection) => Promise<void>;
}

export class NodeSqliteDriver implements Driver {
	readonly #config: NodeSqliteDialectConfig;
	readonly #connectionMutex = new ConnectionMutex();

	#db?: DatabaseSync;
	#connection?: DatabaseConnection;

	constructor(config: NodeSqliteDialectConfig) {
		this.#config = { ...config };
	}

	async init(): Promise<void> {
		this.#db = this.#config.database;

		this.#connection = new NodeSqliteConnection(this.#db);

		if (this.#config.onCreateConnection) {
			await this.#config.onCreateConnection(this.#connection);
		}
	}

	async acquireConnection(): Promise<DatabaseConnection> {
		// SQLite only has one single connection. We use a mutex here to wait
		// until the single connection has been released.
		await this.#connectionMutex.lock();
		return this.#connection!;
	}

	async beginTransaction(connection: DatabaseConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw("begin"));
	}

	async commitTransaction(connection: DatabaseConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw("commit"));
	}

	async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
		await connection.executeQuery(CompiledQuery.raw("rollback"));
	}

	async releaseConnection(): Promise<void> {
		this.#connectionMutex.unlock();
	}

	async destroy(): Promise<void> {
		this.#db?.close();
	}
}

class NodeSqliteConnection implements DatabaseConnection {
	readonly #db: DatabaseSync;

	constructor(db: DatabaseSync) {
		this.#db = db;
	}

	executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
		const { sql, parameters } = compiledQuery;
		const stmt = this.#db.prepare(sql);

		const rows = stmt.all(...(parameters as any[])) as O[];

		return Promise.resolve({
			rows,
		});
	}

	async *streamQuery() {
		throw new Error("Streaming query is not supported by SQLite driver.");
	}
}

class ConnectionMutex {
	#promise?: Promise<void>;
	#resolve?: () => void;

	async lock(): Promise<void> {
		while (this.#promise) {
			await this.#promise;
		}

		this.#promise = new Promise((resolve) => {
			this.#resolve = resolve;
		});
	}

	unlock(): void {
		const resolve = this.#resolve;

		this.#promise = undefined;
		this.#resolve = undefined;

		resolve?.();
	}
}

export class NodeSqliteIntrospector implements DatabaseIntrospector {
	readonly #db: Kysely<unknown>;

	constructor(db: Kysely<unknown>) {
		this.#db = db;
	}

	async getSchemas(): Promise<SchemaMetadata[]> {
		// Sqlite doesn't support schemas.
		return [];
	}

	async getTables(
		options: DatabaseMetadataOptions = { withInternalKyselyTables: false },
	): Promise<TableMetadata[]> {
		let query = this.#db
			// @ts-ignore
			.selectFrom("sqlite_schema")
			// @ts-ignore
			.where("type", "=", "table")
			// @ts-ignore
			.where("name", "not like", "sqlite_%")
			// @ts-ignore
			.select("name")
			.$castTo<{ name: string }>();

		if (!options.withInternalKyselyTables) {
			query = query
				// @ts-ignore
				.where("name", "!=", DEFAULT_MIGRATION_TABLE)
				// @ts-ignore
				.where("name", "!=", DEFAULT_MIGRATION_LOCK_TABLE);
		}

		const tables = await query.execute();
		return Promise.all(tables.map(({ name }) => this.#getTableMetadata(name)));
	}

	async getMetadata(
		options?: DatabaseMetadataOptions,
	): Promise<DatabaseMetadata> {
		return {
			tables: await this.getTables(options),
		};
	}

	async #getTableMetadata(table: string): Promise<TableMetadata> {
		const db = this.#db;

		// Get the SQL that was used to create the table.
		const createSql = await db
			// @ts-ignore
			.selectFrom("sqlite_master")
			// @ts-ignore
			.where("name", "=", table)
			// @ts-ignore
			.select("sql")
			.$castTo<{ sql: string | undefined }>()
			.execute();

		// Try to find the name of the column that has `autoincrement` >&
		const autoIncrementCol = createSql[0]?.sql
			?.split(/[\(\),]/)
			?.find((it) => it.toLowerCase().includes("autoincrement"))
			?.split(/\s+/)?.[0]
			?.replace(/["`]/g, "");

		const columns = await db
			.selectFrom(
				sql<{
					name: string;
					type: string;
					notnull: 0 | 1;
					dflt_value: any;
				}>`pragma_table_info(${table})`.as("table_info"),
			)
			.select(["name", "type", "notnull", "dflt_value"])
			.execute();

		return {
			name: table,
			columns: columns.map((col) => ({
				name: col.name,
				dataType: col.type,
				isNullable: !col.notnull,
				isAutoIncrementing: col.name === autoIncrementCol,
				hasDefaultValue: col.dflt_value != null,
			})),
			isView: true,
		};
	}
}

export class NodeSqliteQueryCompiler extends DefaultQueryCompiler {
	protected override getCurrentParameterPlaceholder() {
		return "?";
	}

	protected override getLeftIdentifierWrapper(): string {
		return '"';
	}

	protected override getRightIdentifierWrapper(): string {
		return '"';
	}

	protected override getAutoIncrement() {
		return "autoincrement";
	}
}

export class NodeSqliteDialect implements Dialect {
	readonly #config: NodeSqliteDialectConfig;

	constructor(config: NodeSqliteDialectConfig) {
		this.#config = { ...config };
	}

	createDriver(): Driver {
		return new NodeSqliteDriver(this.#config);
	}

	createQueryCompiler(): QueryCompiler {
		return new NodeSqliteQueryCompiler();
	}

	createAdapter(): DialectAdapter {
		return new NodeSqliteAdapter();
	}

	createIntrospector(db: Kysely<any>): DatabaseIntrospector {
		return new NodeSqliteIntrospector(db);
	}
}
