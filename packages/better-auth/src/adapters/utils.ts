import { BetterAuthError } from "../error/better-auth-error";
import type { BetterAuthOptions } from "../types";
import type { Adapter } from "../types/adapter";
import { getAuthTables } from "./get-tables";
import { createKyselyAdapter, getDatabaseType, kyselyAdapter } from "./kysely";

export function getAdapter(options: BetterAuthOptions): Adapter {
	if (!options.database) {
		throw new BetterAuthError("Database configuration is required");
	}
	const db = createKyselyAdapter(options);
	if (!db) {
		throw new BetterAuthError("Failed to initialize database adapter");
	}
	const tables = getAuthTables(options);
	return kyselyAdapter(db, {
		transform: {
			schema: {
				[tables.user.tableName]: tables.user.fields,
				[tables.session.tableName]: tables.session.fields,
				[tables.account.tableName]: tables.account.fields,
			},
			date: true,
			boolean: getDatabaseType(options) === "sqlite",
		},
	});
}
