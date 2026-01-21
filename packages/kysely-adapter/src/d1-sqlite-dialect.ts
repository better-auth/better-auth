/**
 * D1-compatible SQLite dialect for Cloudflare D1.
 *
 * @see https://developers.cloudflare.com/d1/worker-api/d1-database
 */

import type { D1Database } from "@cloudflare/workers-types";
import type {
	CompiledQuery,
	DatabaseConnection,
	DatabaseIntrospector,
	DatabaseMetadata,
	DatabaseMetadataOptions,
	Dialect,
	DialectAdapter,
	DialectAdapterBase,
	Driver,
	Kysely,
	QueryCompiler,
	QueryResult,
	SchemaMetadata,
	TableMetadata,
} from "kysely";
import {
	DEFAULT_MIGRATION_LOCK_TABLE,
	DEFAULT_MIGRATION_TABLE,
	DefaultQueryCompiler,
} from "kysely";

class D1SqliteAdapter implements DialectAdapterBase {
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
 * Config for the D1 SQLite dialect.
 */
export interface D1SqliteDialectConfig {
	/**
	 * A Cloudflare D1 database instance.
	 */
	database: D1Database;

	/**
	 * Called once when the first query is executed.
	 */
	onCreateConnection?:
		| ((connection: DatabaseConnection) => Promise<void>)
		| undefined;
}

class D1SqliteDriver implements Driver {
	readonly #config: D1SqliteDialectConfig;
	#connection?: DatabaseConnection;

	constructor(config: D1SqliteDialectConfig) {
		this.#config = { ...config };
	}

	async init(): Promise<void> {
		this.#connection = new D1SqliteConnection(this.#config.database);

		if (this.#config.onCreateConnection) {
			await this.#config.onCreateConnection(this.#connection);
		}
	}

	async acquireConnection(): Promise<DatabaseConnection> {
		return this.#connection!;
	}

	async beginTransaction(): Promise<void> {
		/**
		 * D1 operates in auto-commit mode and does not support interactive transactions.
		 * Use db.batch() for transactional behavior instead.
		 *
		 * @see https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
		 */
		throw new Error(
			"D1 does not support interactive transactions. Use db.batch() instead.",
		);
	}

	async commitTransaction(): Promise<void> {
		throw new Error(
			"D1 does not support interactive transactions. Use db.batch() instead.",
		);
	}

	async rollbackTransaction(): Promise<void> {
		throw new Error(
			"D1 does not support interactive transactions. Use db.batch() instead.",
		);
	}

	async releaseConnection(): Promise<void> {}

	async destroy(): Promise<void> {}
}

class D1SqliteConnection implements DatabaseConnection {
	readonly #db: D1Database;

	constructor(db: D1Database) {
		this.#db = db;
	}

	async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
		const results = await this.#db
			.prepare(compiledQuery.sql)
			.bind(...compiledQuery.parameters)
			.all();

		const numAffectedRows =
			results.meta.changes > 0 ? BigInt(results.meta.changes) : undefined;

		return {
			insertId:
				results.meta.last_row_id === undefined ||
				results.meta.last_row_id === null
					? undefined
					: BigInt(results.meta.last_row_id),
			rows: (results?.results as O[]) || [],
			numAffectedRows,
			// @ts-expect-error - deprecated in kysely >= 0.23, keep for backward compatibility
			numUpdatedOrDeletedRows: numAffectedRows,
		};
	}

	async *streamQuery<O>(): AsyncIterableIterator<QueryResult<O>> {
		throw new Error("D1 does not support streaming queries.");
	}
}

class D1SqliteIntrospector implements DatabaseIntrospector {
	readonly #db: Kysely<unknown>;
	readonly #d1: D1Database;

	constructor(db: Kysely<unknown>, d1: D1Database) {
		this.#db = db;
		this.#d1 = d1;
	}

	async getSchemas(): Promise<SchemaMetadata[]> {
		// SQLite doesn't support schemas.
		return [];
	}

	async getTables(
		options: DatabaseMetadataOptions = { withInternalKyselyTables: false },
	): Promise<TableMetadata[]> {
		let query = this.#db
			// @ts-expect-error - sqlite_master is not in the schema
			.selectFrom("sqlite_master")
			// @ts-expect-error
			.where("type", "in", ["table", "view"])
			// @ts-expect-error
			.where("name", "not like", "sqlite_%")
			// @ts-expect-error - D1 internal tables
			.where("name", "not like", "_cf_%")
			.select(["name", "type", "sql"])
			.$castTo<{ name: string; type: string; sql: string | null }>();

		if (!options.withInternalKyselyTables) {
			query = query
				// @ts-expect-error
				.where("name", "!=", DEFAULT_MIGRATION_TABLE)
				// @ts-expect-error
				.where("name", "!=", DEFAULT_MIGRATION_LOCK_TABLE);
		}

		const tables = await query.execute();

		if (tables.length === 0) {
			return [];
		}

		const statements = tables.map((table) =>
			this.#d1.prepare("SELECT * FROM pragma_table_info(?)").bind(table.name),
		);
		const batchResults = await this.#d1.batch(statements);

		return tables.map((table, index) => {
			const columnInfo = (batchResults[index]?.results ?? []) as Array<{
				cid: number;
				name: string;
				type: string;
				notnull: number;
				dflt_value: string | null;
				pk: number;
			}>;

			// Find the column that has `autoincrement` from CREATE SQL
			const autoIncrementCol = table.sql
				?.split(/[(),]/)
				?.find((it) => it.toLowerCase().includes("autoincrement"))
				?.split(/\s+/)
				?.filter(Boolean)?.[0]
				?.replace(/["`]/g, "");

			return {
				name: table.name,
				isView: table.type === "view",
				columns: columnInfo.map((col) => ({
					name: col.name,
					dataType: col.type,
					isNullable: !col.notnull,
					isAutoIncrementing: col.name === autoIncrementCol,
					hasDefaultValue: col.dflt_value != null,
				})),
			};
		});
	}

	async getMetadata(
		options?: DatabaseMetadataOptions,
	): Promise<DatabaseMetadata> {
		return {
			tables: await this.getTables(options),
		};
	}
}

class D1SqliteQueryCompiler extends DefaultQueryCompiler {
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

export class D1SqliteDialect implements Dialect {
	readonly #config: D1SqliteDialectConfig;

	constructor(config: D1SqliteDialectConfig) {
		this.#config = { ...config };
	}

	createDriver(): Driver {
		return new D1SqliteDriver(this.#config);
	}

	createQueryCompiler(): QueryCompiler {
		return new D1SqliteQueryCompiler();
	}

	createAdapter(): DialectAdapter {
		return new D1SqliteAdapter();
	}

	createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
		return new D1SqliteIntrospector(db, this.#config.database);
	}
}
