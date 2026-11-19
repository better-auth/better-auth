import type { BetterAuthOptions } from "@better-auth/core";
import { getAuthTables } from "@better-auth/core/db";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { logger } from "@better-auth/core/env";
import type { MemoryDB } from "@better-auth/memory-adapter";

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
		const { memoryAdapter } = await import("@better-auth/memory-adapter");
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

	if (typeof adapter.createMany !== "function") {
		logger.warn(
			"Adapter does not correctly implement createMany, patching it automatically with sequential create. Please update your adapter implementation.",
		);
		const patchCreateMany = (
			target: Pick<DBAdapter<BetterAuthOptions>, "create" | "createMany">,
		) => {
			if (typeof target.createMany === "function") return;
			target.createMany = async ({ data, model, select, forceAllowId }) => {
				const created: unknown[] = [];
				for (const row of data) {
					created.push(
						await target.create({
							data: row,
							model,
							select,
							forceAllowId,
						}),
					);
				}
				return created as never;
			};
		};
		patchCreateMany(adapter);
		const originalTransaction = adapter.transaction;
		if (typeof originalTransaction === "function") {
			adapter.transaction = async (callback) => {
				return originalTransaction(async (trx) => {
					patchCreateMany(trx);
					return callback(trx);
				});
			};
		}
	}

	return adapter;
}
