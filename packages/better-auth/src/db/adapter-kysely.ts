import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { getBaseAdapter } from "./adapter-base";

export async function getAdapter(
	options: BetterAuthOptions,
): Promise<DBAdapter<BetterAuthOptions>> {
	return getBaseAdapter(options, async (opts) => {
		let adapterModule: typeof import("../adapters/kysely-adapter");
		try {
			adapterModule = await import("../adapters/kysely-adapter");
		} catch (error) {
			if (
				error !== null &&
				typeof error === "object" &&
				"code" in error &&
				error.code === "ERR_MODULE_NOT_FOUND"
			) {
				throw new BetterAuthError(
					"A raw database connection uses the built-in Kysely adapter, but `kysely` is not installed. Run `npm install kysely`, or pass an adapter such as drizzleAdapter() or prismaAdapter() instead.",
				);
			}
			throw error;
		}
		const { createKyselyAdapter, kyselyAdapter } = adapterModule;
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
