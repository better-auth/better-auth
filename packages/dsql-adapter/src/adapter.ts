import type { BetterAuthOptions } from "@better-auth/core";
import type {
	DBAdapter,
	DBAdapterDebugLogOption,
} from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import type { Kysely } from "kysely";
import { assertDsqlDatabase } from "./dialect";
import { isSerializationFailure, withDsqlRetry } from "./retry";

/**
 * Options for `dsqlAdapter`.
 */
export interface DsqlAdapterConfig {
	schemaName?: string | undefined;
	debugLogs?: DBAdapterDebugLogOption | undefined;
}

/**
 * Aurora DSQL adapter. It uses the Kysely adapter's PostgreSQL support and
 * retries operations that DSQL aborts with a serialization error.
 */
export function dsqlAdapter<DB>(
	database: Kysely<DB>,
	config: DsqlAdapterConfig = {},
) {
	assertDsqlDatabase(database);
	const db = config.schemaName
		? database.withSchema(config.schemaName)
		: database;
	return (options: BetterAuthOptions): DBAdapter => {
		if (options.secondaryStorage) {
			throw new BetterAuthError(
				"The Aurora DSQL adapter doesn't support secondaryStorage. A retried transaction can't undo writes it already made there.",
			);
		}
		const adapter = kyselyAdapter(db, {
			type: "postgres",
			transaction: true,
			debugLogs: config.debugLogs,
			isRetryableError: isSerializationFailure,
			async getMigrations(authOptions) {
				const { getDsqlMigrations } = await import("./migration");
				return getDsqlMigrations(authOptions, database, config);
			},
		})(options);
		const raw = { ...adapter };
		// Patch the adapter in place. The schema check is registered against this
		// exact object, so a copy wouldn't be checked.
		Object.assign(adapter, {
			id: "dsql",
			create: (data) => withDsqlRetry(() => raw.create(data)),
			findOne: (data) => withDsqlRetry(() => raw.findOne(data)),
			findMany: (data) => withDsqlRetry(() => raw.findMany(data)),
			update: (data) => withDsqlRetry(() => raw.update(data)),
			updateMany: (data) => withDsqlRetry(() => raw.updateMany(data)),
			delete: (data) => withDsqlRetry(() => raw.delete(data)),
			deleteMany: (data) => withDsqlRetry(() => raw.deleteMany(data)),
			count: (data) => withDsqlRetry(() => raw.count(data)),
			consumeOne: (data) => withDsqlRetry(() => raw.consumeOne(data)),
			incrementOne: (data) => withDsqlRetry(() => raw.incrementOne(data)),
			transaction: (cb) => withDsqlRetry(() => raw.transaction(cb)),
			async createSchema(authOptions, file) {
				const { getDsqlMigrations } = await import("./migration");
				const plan = await getDsqlMigrations(authOptions, database, config);
				if (plan.schemaProblems.length)
					throw new BetterAuthError(plan.schemaProblems.join("\n"));
				const code = await plan.compileMigrations();
				return {
					code: code === ";" ? "" : code,
					path: file ?? `./better-auth_migrations/${Date.now()}.sql`,
				};
			},
		} satisfies DBAdapter);
		return adapter;
	};
}
