import { createLogger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { getKyselyDatabaseType } from "@better-auth/kysely-adapter";
import { getAdapter } from "../db/adapter-kysely";
import { getMigrations } from "../db/get-migration";
import { withLegacyAccountIssuer } from "../db/legacy-account-issuer";
import type { BetterAuthOptions } from "../types";
import { createAuthContext } from "./create-context";

export const init = async (options: BetterAuthOptions) => {
	const adapter = withLegacyAccountIssuer(
		await getAdapter(options),
		(probeOptions) => getAdapter(probeOptions),
		options,
		createLogger(options.logger),
	);

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
