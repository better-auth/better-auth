import type {
	AtomicWriteOperation,
	AtomicWriteResult,
	CleanedWhere,
} from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

type DrizzleProvider = "pg" | "mysql" | "sqlite";

interface ReturningQuery {
	all: () => unknown;
}

interface InsertBuilder {
	values: (data: Record<string, unknown>) => {
		returning: () => ReturningQuery;
	};
}

interface UpdateBuilder {
	set: (data: Record<string, unknown>) => {
		where: (...clauses: SQL[]) => {
			returning: () => ReturningQuery;
		};
	};
}

interface RunnableQuery {
	run: () => unknown;
	where: (...clauses: SQL[]) => RunnableQuery;
}

interface AtomicDrizzleDatabase {
	$client?: unknown;
	batch?: (queries: readonly unknown[]) => unknown;
	delete: (table: unknown) => RunnableQuery;
	insert: (table: unknown) => InsertBuilder;
	transaction?: <T>(callback: (transaction: AtomicDrizzleDatabase) => T) => T;
	update: (table: unknown) => UpdateBuilder;
}

type AtomicWriteCommit = (
	operations: readonly AtomicWriteOperation<CleanedWhere>[],
) => Promise<AtomicWriteResult[]>;

interface DrizzleAtomicWriteOptions {
	atomicWriteMode: DrizzleAtomicWriteMode;
	convertWhereClause: (where: CleanedWhere[], model: string) => SQL[];
	database: unknown;
	getSchema: (model: string) => unknown;
	readAffectedRowCount: (
		result: unknown,
		operation: "delete" | "deleteMany",
		context: { model: string; where: CleanedWhere[] },
	) => number;
}

export type DrizzleAtomicWriteMode =
	| "d1-batch"
	| "synchronous-sqlite-transaction"
	| "async-transaction"
	| "unavailable";

/**
 * Selects how the Drizzle adapter coordinates multi-write mutations.
 *
 * `"async"` advertises Drizzle's interactive async transaction API.
 * `"sync"` uses a synchronous SQLite transaction for predeclared atomic
 * writes without passing an async callback to the driver. Set this to `false`
 * when the database has neither transaction mode; D1 batch support is detected
 * independently.
 */
export type DrizzleTransactionMode = "async" | "sync" | false;

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function hasFunction(value: Record<string, unknown>, key: string): boolean {
	return typeof value[key] === "function";
}

function isD1DrizzleDatabase(database: unknown): boolean {
	if (!isObject(database) || !hasFunction(database, "batch")) return false;
	const client = database.$client;
	return (
		isObject(client) &&
		hasFunction(client, "prepare") &&
		hasFunction(client, "batch") &&
		hasFunction(client, "exec")
	);
}

function getReturnedRecord(result: unknown): Record<string, unknown> | null {
	if (!Array.isArray(result)) return null;
	const record: unknown = result[0];
	return isObject(record) ? record : null;
}

function getRequiredReturnedRecord(
	result: unknown,
	adapterLabel: string,
	model: string,
): Record<string, unknown> {
	const record = getReturnedRecord(result);
	if (!record) {
		throw new BetterAuthError(
			`${adapterLabel} did not return the created "${model}" record`,
		);
	}
	return record;
}

function getSingleDeleteCount(count: number, adapterLabel: string): 0 | 1 {
	if (count === 0 || count === 1) return count;
	throw new BetterAuthError(
		`${adapterLabel} deleted ${count} rows for a single-row delete operation`,
	);
}

function getExactWhereClause(
	operation: Extract<
		AtomicWriteOperation<CleanedWhere>,
		{ type: "update" | "delete" }
	>,
	convertWhereClause: DrizzleAtomicWriteOptions["convertWhereClause"],
): SQL[] {
	return operation.where.length > 0
		? convertWhereClause(operation.where, operation.model)
		: [sql`0 = 1`];
}

function buildAtomicWriteQuery(
	database: AtomicDrizzleDatabase,
	operation: AtomicWriteOperation<CleanedWhere>,
	options: DrizzleAtomicWriteOptions,
): ReturningQuery | RunnableQuery {
	const schema = options.getSchema(operation.model);
	switch (operation.type) {
		case "create":
			return database.insert(schema).values(operation.data).returning();
		case "update":
			return database
				.update(schema)
				.set(operation.update)
				.where(...getExactWhereClause(operation, options.convertWhereClause))
				.returning();
		case "delete":
			return database
				.delete(schema)
				.where(...getExactWhereClause(operation, options.convertWhereClause));
		case "deleteMany": {
			const query = database.delete(schema);
			return operation.where.length === 0
				? query
				: query.where(
						...options.convertWhereClause(operation.where, operation.model),
					);
		}
	}
}

function mapAtomicWriteResult(
	operation: AtomicWriteOperation<CleanedWhere>,
	result: unknown,
	adapterLabel: string,
	readAffectedRowCount: DrizzleAtomicWriteOptions["readAffectedRowCount"],
): AtomicWriteResult {
	switch (operation.type) {
		case "create":
			return {
				type: "create",
				record: getRequiredReturnedRecord(
					result,
					adapterLabel,
					operation.model,
				),
			};
		case "update":
			return { type: "update", record: getReturnedRecord(result) };
		case "delete":
			return {
				type: "delete",
				deletedCount: getSingleDeleteCount(
					readAffectedRowCount(result, "delete", {
						model: operation.model,
						where: operation.where,
					}),
					adapterLabel,
				),
			};
		case "deleteMany":
			return {
				type: "deleteMany",
				deletedCount: readAffectedRowCount(result, "deleteMany", {
					model: operation.model,
					where: operation.where,
				}),
			};
	}
}

function createD1BatchCommit(
	database: AtomicDrizzleDatabase,
	options: DrizzleAtomicWriteOptions,
): AtomicWriteCommit {
	return async (operations) => {
		if (operations.length === 0) return [];
		const queries = operations.map((operation) =>
			buildAtomicWriteQuery(database, operation, options),
		);
		const batchResult: unknown = await database.batch?.(queries);
		if (
			!Array.isArray(batchResult) ||
			batchResult.length !== operations.length
		) {
			throw new BetterAuthError(
				"Drizzle D1 batch returned an unexpected number of results",
			);
		}
		return operations.map((operation, index) =>
			mapAtomicWriteResult(
				operation,
				batchResult[index],
				"Drizzle D1 batch",
				options.readAffectedRowCount,
			),
		);
	};
}

function createSynchronousSqliteCommit(
	database: AtomicDrizzleDatabase,
	options: DrizzleAtomicWriteOptions,
): AtomicWriteCommit {
	return async (operations) => {
		if (operations.length === 0) return [];
		if (!database.transaction) {
			throw new BetterAuthError(
				"Drizzle synchronous SQLite database does not expose transactions",
			);
		}

		return database.transaction((transaction) =>
			operations.map((operation) => {
				const query = buildAtomicWriteQuery(transaction, operation, options);
				const result =
					operation.type === "create" || operation.type === "update"
						? (query as ReturningQuery).all()
						: (query as RunnableQuery).run();
				return mapAtomicWriteResult(
					operation,
					result,
					"Drizzle synchronous SQLite transaction",
					options.readAffectedRowCount,
				);
			}),
		);
	};
}

export function createDrizzleAtomicWriteCapability(
	options: DrizzleAtomicWriteOptions,
): { commitAtomicWrites: AtomicWriteCommit | undefined } {
	const database = options.database as AtomicDrizzleDatabase;
	const mode = options.atomicWriteMode;
	if (mode === "d1-batch") {
		return {
			commitAtomicWrites: createD1BatchCommit(database, options),
		};
	}
	if (mode === "synchronous-sqlite-transaction") {
		return {
			commitAtomicWrites: createSynchronousSqliteCommit(database, options),
		};
	}
	return {
		commitAtomicWrites: undefined,
	};
}

export function getDrizzleAtomicWriteMode(
	database: unknown,
	provider: DrizzleProvider,
	transactionMode: DrizzleTransactionMode,
): DrizzleAtomicWriteMode {
	if (provider === "sqlite" && isD1DrizzleDatabase(database)) {
		return "d1-batch";
	}
	if (transactionMode === false) return "unavailable";
	if (transactionMode === "sync") {
		if (provider !== "sqlite") {
			throw new BetterAuthError(
				'Drizzle transaction mode "sync" is only supported by SQLite databases',
			);
		}
		if (!isObject(database) || !hasFunction(database, "transaction")) {
			throw new BetterAuthError(
				'Drizzle transaction mode "sync" requires a synchronous SQLite transaction function',
			);
		}
		return "synchronous-sqlite-transaction";
	}
	return isObject(database) && hasFunction(database, "transaction")
		? "async-transaction"
		: "unavailable";
}
