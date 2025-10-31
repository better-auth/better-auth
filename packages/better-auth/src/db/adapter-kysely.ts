import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { kyselyAdapter } from "../adapters/kysely-adapter";
import { createKyselyAdapter } from "../adapters/kysely-adapter/dialect";
import { getBaseAdapter } from "./adapter-base";

export async function getAdapterWithKysely(
	options: BetterAuthOptions,
): Promise<DBAdapter<BetterAuthOptions>> {
	return getBaseAdapter(options, async (opts) => {
		const { kysely, databaseType, transaction } =
			await createKyselyAdapter(opts);
		if (!kysely) {
			throw new BetterAuthError("Failed to initialize database adapter");
		}
		return kyselyAdapter(kysely, {
			type: databaseType || "sqlite",
			debugLogs:
				opts.database && "debugLogs" in opts.database
					? opts.database.debugLogs
					: false,
			transaction: transaction,
		})(opts);
	});
}

/**
 * @deprecated Use getAdapterWithKysely instead
 */
export const getAdapter = getAdapterWithKysely;
