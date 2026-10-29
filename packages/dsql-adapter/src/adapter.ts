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

/** Configuration owned by the DSQL adapter, independent of shared auth options. */
export interface DsqlAdapterConfig {
	schemaName?: string | undefined;
	debugLogs?: DBAdapterDebugLogOption | undefined;
}

/** Reuse Kysely's PostgreSQL operations with bounded DSQL transaction retries. */
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
				"The Aurora DSQL adapter requires database-backed storage without secondaryStorage; transaction retries cannot roll back external writes.",
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
		// Keep the registered schema-check identity of the Kysely adapter.
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
