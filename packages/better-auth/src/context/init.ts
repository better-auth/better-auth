import { BetterAuthError } from "@better-auth/core/error";
import { getKyselyDatabaseType } from "../adapters/kysely-adapter/dialect";
import { getAdapterWithKysely } from "../db/adapter-kysely";
import { getMigrations } from "../db/get-migration";
import type { BetterAuthOptions, DBAdapter } from "../types";
import { createAuthContext } from "./base";

const initBase = async (adapter: DBAdapter, options: BetterAuthOptions) => {
	// Get database type using Kysely's dialect detection
	const getDatabaseType = (database: BetterAuthOptions["database"]) =>
		getKyselyDatabaseType(database) || "unknown";

	// Use base context creation
	const ctx = await createAuthContext(adapter, options, getDatabaseType);

	// Add runMigrations with Kysely support
	ctx.runMigrations = async function () {
		// only run migrations if database is provided and it's not an adapter
		if (!options.database || "updateMany" in options.database) {
			throw new BetterAuthError(
				"Database is not provided or it's an adapter. Migrations are only supported with a database instance.",
			);
		}
		const { runMigrations } = await getMigrations(options);
		await runMigrations();
	};

	return ctx;
};

export const init = async (options: BetterAuthOptions) => {
	const adapter = await getAdapterWithKysely(options);
	return initBase(adapter, options);
};
