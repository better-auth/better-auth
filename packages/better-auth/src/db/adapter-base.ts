import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { logger } from "@better-auth/core/env";
import { type MemoryDB, memoryAdapter } from "../adapters/memory-adapter";
import { getAuthTables } from "./get-tables";

export async function getBaseAdapter(
	options: BetterAuthOptions,
	handleDirectDatabase: (
		options: BetterAuthOptions,
	) => Promise<DBAdapter<BetterAuthOptions>>,
): Promise<DBAdapter<BetterAuthOptions>> {
	let adapter: DBAdapter<BetterAuthOptions>;

	if (!options.database) {
		const tables = getAuthTables(options);
		const memoryDB = Object.keys(tables).reduce<MemoryDB>((acc, key) => {
			acc[key] = [];
			return acc;
		}, {});
		logger.warn(
			"No database configuration provided. Using memory adapter in development",
		);
		adapter = memoryAdapter(memoryDB)(options);
	} else if (typeof options.database === "function") {
		adapter = options.database(options);
	} else {
		adapter = await handleDirectDatabase(options);
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
