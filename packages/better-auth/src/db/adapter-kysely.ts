import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { getBaseAdapter } from "./adapter-base";

export async function getAdapter(
	options: BetterAuthOptions,
): Promise<DBAdapter<BetterAuthOptions>> {
	return getBaseAdapter(options, async (opts) => {
		const { createKyselyAdapter } = await import("../adapters/kysely-adapter");
		const { kysely, databaseType, transaction } =
			await createKyselyAdapter(opts);
		if (!kysely) {
			throw new BetterAuthError("Failed to initialize database adapter");
		}
		const { kyselyAdapter } = await import("../adapters/kysely-adapter");
		const adapter = kyselyAdapter(kysely, {
			type: databaseType || "sqlite",
			debugLogs:
				opts.database && "debugLogs" in opts.database
					? opts.database.debugLogs
					: false,
			transaction: transaction,
		})(opts);
		if (opts.advanced?.database?.validateSchema === false) return adapter;
		const { validateDatabaseSchema, withSchemaValidation } = await import(
			"./validate-schema"
		);
		const { getSchema } = await import("./get-schema");
		const expected = getSchema(opts);
		return withSchemaValidation(adapter, () =>
			validateDatabaseSchema(kysely, databaseType || "sqlite", expected),
		);
	});
}
