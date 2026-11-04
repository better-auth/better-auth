import type { DBAdapter } from "better-auth";
import { APIError } from "better-auth/api";

/** Error code when SCIM is asked to run without a native transaction. */
export const SCIM_REQUIRES_NATIVE_TRANSACTIONS =
	"SCIM_REQUIRES_NATIVE_TRANSACTIONS";

const NATIVE_TRANSACTION_MESSAGE =
	"The scim plugin requires a database adapter with native transaction support.";

/** True when the adapter can run an interactive transaction callback. */
export function supportsNativeSCIMTransactions(
	adapter: Pick<DBAdapter, "options">,
): boolean {
	return typeof adapter.options?.adapterConfig.transaction === "function";
}

/** Rejects adapters whose transaction method is only the sequential fallback. */
export function assertNativeSCIMTransactions(
	adapter: Pick<DBAdapter, "options">,
): void {
	if (supportsNativeSCIMTransactions(adapter)) return;
	throw new APIError("NOT_IMPLEMENTED", {
		code: SCIM_REQUIRES_NATIVE_TRANSACTIONS,
		message: NATIVE_TRANSACTION_MESSAGE,
	});
}
