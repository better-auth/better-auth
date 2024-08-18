import { BetterAuthError } from "../error/better-auth-error";
import { BetterAuthOptions } from "../types";
import { Adapter } from "../types/adapter";
import { getAuthTables } from "./get-tables";
import { createKyselyAdapter, getDatabaseType, kyselyAdapter } from "./kysely";

export function getAdapter(options: BetterAuthOptions): Adapter {
	if ("provider" in options.database) {
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
	return options.database;
}
