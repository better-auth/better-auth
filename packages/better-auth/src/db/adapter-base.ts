import type { BetterAuthOptions } from "@better-auth/core";
import type { BetterAuthDBSchema } from "@better-auth/core/db";
import { getAuthTables } from "@better-auth/core/db";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { logger } from "@better-auth/core/env";
import type { MemoryDB } from "@better-auth/memory-adapter";

export async function getBaseAdapter(
	options: BetterAuthOptions,
	handleDirectDatabase: (
		options: BetterAuthOptions,
		tables: BetterAuthDBSchema,
	) => Promise<DBAdapter<BetterAuthOptions>>,
): Promise<DBAdapter<BetterAuthOptions>> {
	// Single source of truth for the logical auth schema: host better-auth's
	// @better-auth/core. Adapters receive this instead of rebuilding via their
	// own getAuthTables (which can diverge under package version skew).
	const tables = getAuthTables(options);

	let adapter: DBAdapter<BetterAuthOptions>;

	if (!options.database) {
		const memoryDB = Object.keys(tables).reduce<MemoryDB>((acc, key) => {
			acc[key] = [];
			return acc;
		}, {});
		const { memoryAdapter } = await import("@better-auth/memory-adapter");
		adapter = memoryAdapter(memoryDB)(options, tables);
	} else if (typeof options.database === "function") {
		adapter = options.database(options, tables);
	} else {
		adapter = await handleDirectDatabase(options, tables);
	}

	// patch for 1.3.x to ensure we have a transaction function in the adapter
	if (!adapter.transaction) {
		logger.warn(
			"Adapter does not correctly implement transaction function, patching it automatically. Please update your adapter implementation.",
		);
		adapter.transaction = async (cb) => {
			return cb(adapter);
		};
	}

	return adapter;
}
