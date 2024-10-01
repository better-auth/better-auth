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
