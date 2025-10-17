import { getAuthTables } from ".";
import { BetterAuthError } from "@better-auth/core/error";
import type { BetterAuthOptions } from "@better-auth/core";
import { createKyselyAdapter } from "../adapters/kysely-adapter";
import { kyselyAdapter } from "../adapters/kysely-adapter";
import { memoryAdapter, type MemoryDB } from "../adapters/memory-adapter";
import { logger } from "@better-auth/core/env";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { DBAdapter } from "@better-auth/core/db/adapter";

export async function getAdapter(
	options: BetterAuthOptions,
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
		const { kysely, databaseType, transaction } =
			await createKyselyAdapter(options);
		if (!kysely) {
			throw new BetterAuthError("Failed to initialize database adapter");
		}
		adapter = kyselyAdapter(kysely, {
			type: databaseType || "sqlite",
			debugLogs:
				"debugLogs" in options.database ? options.database.debugLogs : false,
			transaction: transaction,
		})(options);
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

export function convertToDB<T extends Record<string, any>>(
	fields: Record<string, DBFieldAttribute>,
	values: T,
) {
	let result: Record<string, any> = values.id
		? {
				id: values.id,
			}
		: {};
	for (const key in fields) {
		const field = fields[key]!;
		const value = values[key];
		if (value === undefined) {
			continue;
		}
		result[field.fieldName || key] = value;
	}
	return result as T;
}

export function convertFromDB<T extends Record<string, any>>(
	fields: Record<string, DBFieldAttribute>,
	values: T | null,
) {
	if (!values) {
		return null;
	}
	let result: Record<string, any> = {
		id: values.id,
	};
	for (const [key, value] of Object.entries(fields)) {
		result[key] = values[value.fieldName || key];
	}
	return result as T;
}
