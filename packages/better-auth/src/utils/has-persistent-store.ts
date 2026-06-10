import type { BetterAuthOptions } from "@better-auth/core";

export function hasPersistentStore(options: BetterAuthOptions): boolean {
	return !!options.database || !!options.secondaryStorage;
}
