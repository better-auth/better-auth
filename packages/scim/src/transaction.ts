import type { DBAdapter } from "better-auth";
import { BetterAuthError } from "better-auth";

/** Rejects adapters whose transaction method is only the sequential fallback. */
export function assertNativeSCIMTransactions(
	adapter: Pick<DBAdapter, "options">,
): void {
	if (typeof adapter.options?.adapterConfig.transaction === "function") return;
	throw new BetterAuthError(
		"The scim plugin requires a database adapter with native transaction support.",
	);
}
