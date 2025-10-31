import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { getBaseAdapter } from "./adapter-base";

export async function getAdapterWithoutKysely(
	options: BetterAuthOptions,
): Promise<DBAdapter<BetterAuthOptions>> {
	return getBaseAdapter(options, async () => {
		throw new BetterAuthError(
			"Direct database connection requires Kysely. Please use `better-auth` instead of `better-auth/minimal`, or provide an adapter (drizzleAdapter, prismaAdapter, etc.)",
		);
	});
}
