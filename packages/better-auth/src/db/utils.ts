import type { FieldAttribute } from ".";
import { BetterAuthError } from "../error/better-auth-error";
import type { BetterAuthOptions } from "../types";
import type { Adapter } from "../types/adapter";
import { getAuthTables } from "./get-tables";
import { createKyselyAdapter } from "../adapters/kysely-adapter/dialect";
import { kyselyAdapter } from "../adapters/kysely-adapter";

export async function getAdapter(
	options: BetterAuthOptions,
	isCli?: boolean,
): Promise<Adapter> {
	if (!options.database) {
		throw new BetterAuthError("Database configuration is required");
	}

	if ("create" in options.database) {
		return options.database;
	}

	const { kysely, databaseType } = await createKyselyAdapter(options);
	if (!kysely) {
		throw new BetterAuthError("Failed to initialize database adapter");
	}
	const tables = getAuthTables(options);
	let schema: Record<string, Record<string, FieldAttribute>> = {};
	for (const table of Object.values(tables)) {
		schema[table.tableName] = table.fields;
	}
	return kyselyAdapter(kysely, {
		transform: {
			schema,
			date: true,
			boolean: databaseType === "sqlite",
		},
	});
}

export function convertToDB<T extends Record<string, any>>(
	fields: Record<string, FieldAttribute>,
	values: T,
) {
	let result: Record<string, any> = {
		id: values.id,
	};
	for (const key in fields) {
		const field = fields[key];
		const value = values[key];
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
