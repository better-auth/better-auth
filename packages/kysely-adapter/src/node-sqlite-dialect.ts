/**
 * @see {@link https://nodejs.org/api/sqlite.html} - Node.js SQLite API documentation
 */

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
	DatabaseConnection,
	DatabaseIntrospector,
	Dialect,
	DialectAdapter,
	DialectAdapterBase,
	Driver,
	Kysely,
	QueryCompiler,
	QueryResult,
} from "kysely";
import { CompiledQuery, DefaultQueryCompiler } from "kysely";
import { createSqliteIntrospector } from "./sqlite-introspector";

class NodeSqliteAdapter implements DialectAdapterBase {
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
	onCreateConnection?:
		| ((connection: DatabaseConnection) => Promise<void>)
		| undefined;
}

class NodeSqliteDriver implements Driver {
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
		const params = parameters as SQLInputValue[];

		// Row-producing statements (SELECT, RETURNING) expose columns, so they
		// must read through `all()`. Plain mutations expose none; running them
		// through `all()` would discard node:sqlite's change metadata, leaving
		// Kysely to report zero affected rows even when writes occurred.
		if (stmt.columns().length > 0) {
			return Promise.resolve({
				rows: stmt.all(...params) as O[],
			});
		}

		const { changes, lastInsertRowid } = stmt.run(...params);

		return Promise.resolve({
			rows: [],
			numAffectedRows: BigInt(changes),
			insertId:
				typeof lastInsertRowid === "bigint"
					? lastInsertRowid
					: BigInt(lastInsertRowid),
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
		while (this.#promise !== undefined) {
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

class NodeSqliteQueryCompiler extends DefaultQueryCompiler {
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
		return createSqliteIntrospector(db);
	}
}
