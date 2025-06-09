import { getAuthTables, type FieldAttribute } from ".";
import { BetterAuthError } from "../error";
import type { Adapter, BetterAuthOptions } from "../types";
import { createKyselyAdapter } from "../adapters/kysely-adapter/dialect";
import { kyselyAdapter } from "../adapters/kysely-adapter";
import { memoryAdapter } from "../adapters/memory-adapter";
import { logger } from "../utils";

export async function getAdapter(options: BetterAuthOptions): Promise<Adapter> {
	if (!options.database) {
		const tables = getAuthTables(options);
		const memoryDB = Object.keys(tables).reduce((acc, key) => {
			// @ts-ignore
			acc[key] = [];
			return acc;
		}, {});
		logger.warn(
			"No database configuration provided. Using memory adapter in development",
		);
		return memoryAdapter(memoryDB)(options);
	}

	if (typeof options.database === "function") {
		return options.database(options);
	}

	const { kysely, databaseType } = await createKyselyAdapter(options);
	if (!kysely) {
		throw new BetterAuthError("Failed to initialize database adapter");
	}
	return kyselyAdapter(kysely, {
		type: databaseType || "sqlite",
		debugLogs:
			"debugLogs" in options.database ? options.database.debugLogs : false,
	})(options);
}

export function convertToDB<T extends Record<string, any>>(
	fields: Record<string, FieldAttribute>,
	values: T,
) {
	let result: Record<string, any> = values.id
		? {
				id: values.id,
			}
		: {};
	for (const key in fields) {
		const field = fields[key];
		const value = values[key];
		if (value === undefined) {
			continue;
		}
		result[field.fieldName || key] = value;
	}
	return result as T;
}

export function convertFromDB<T extends Record<string, any>>(
	fields: Record<string, FieldAttribute>,
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
