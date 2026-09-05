import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import {
	checksSchema,
	createSchemaCheck,
	registerSchemaCheck,
} from "@better-auth/core/db/internal";
import { BetterAuthError } from "@better-auth/core/error";
import { getBaseAdapter } from "./adapter-base";
import { getSchema } from "./get-schema";
import { findSchemaProblems } from "./schema-check";

export async function getAdapter(
	options: BetterAuthOptions,
): Promise<DBAdapter<BetterAuthOptions>> {
	return getBaseAdapter(options, async (opts) => {
		const { createKyselyAdapter, kyselyAdapter } = await import(
			"../adapters/kysely-adapter"
		);
		const { kysely, databaseType, transaction } =
			await createKyselyAdapter(opts);
		if (!kysely) {
			throw new BetterAuthError("Failed to initialize database adapter");
		}
		const dbType = databaseType || "sqlite";
		const adapter = kyselyAdapter(kysely, {
			type: dbType,
			debugLogs:
				opts.database && "debugLogs" in opts.database
					? opts.database.debugLogs
					: false,
			transaction,
		})(opts);
		if (checksSchema(opts)) {
			const expected = getSchema(opts);
			registerSchemaCheck(
				adapter,
				createSchemaCheck(
					() => findSchemaProblems(kysely, dbType, expected),
					"database",
				),
			);
		}
		return adapter;
	});
}
