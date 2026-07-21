import type { BetterAuthOptions } from "@better-auth/core";

/**
 * Whether a server-side session store (database or secondaryStorage) is
 * available for session storage.
 *
 * Instead of using `typeof options.database === "function"` (which falsely
 * matches `DBAdapterInstance` callable adapters), this function relies on the
 * presence of a truthy `database` or `secondaryStorage` value. The explicit
 * `advanced.database.stateless` option can override this to force stateless
 * semantics for custom no-op adapters.
 */
export function hasServerSessionStore(options: BetterAuthOptions): boolean {
	if (options.advanced?.database?.stateless) {
		return false;
	}
	return !!options.database || !!options.secondaryStorage;
}

function hasServerAccountStore(options: BetterAuthOptions): boolean {
	if (options.advanced?.database?.stateless) {
		return false;
	}
	return !!options.database;
}

export function shouldBindAccountCookieToSessionUser(
	options: BetterAuthOptions,
): boolean {
	return hasServerAccountStore(options);
}
