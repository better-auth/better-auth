import type { BetterAuthOptions } from "@better-auth/core";

function isExplicitStatelessConfig(options: BetterAuthOptions): boolean {
	const hasCookieCache = !!options.session?.cookieCache?.enabled;
	const hasAccountCookie = !!options.account?.storeAccountCookie;
	return hasCookieCache && hasAccountCookie;
}

/**
 * Whether a server-side session store (database or secondaryStorage) is
 * available for session storage.
 *
 * A custom adapter function combined with explicit cookie-only configuration
 * (cookie cache + account cookies) is treated as stateless — the adapter is
 * expected to be a no-op/stateless adapter that doesn't actually store data.
 */
export function hasServerSessionStore(options: BetterAuthOptions): boolean {
	// When the user has explicitly configured both cookie-based session caching
	// AND cookie-based account storage, and provides a custom adapter function
	// (rather than a real database connection), the deployment is cookie-only
	// and the adapter is expected to be a stateless no-op.
	if (
		typeof options.database === "function" &&
		isExplicitStatelessConfig(options) &&
		!options.secondaryStorage
	) {
		return false;
	}
	return !!options.database || !!options.secondaryStorage;
}

function hasServerAccountStore(options: BetterAuthOptions): boolean {
	// A custom adapter function in cookie-only mode doesn't provide a real
	// server-side account store either.
	if (
		typeof options.database === "function" &&
		isExplicitStatelessConfig(options)
	) {
		return false;
	}
	return !!options.database;
}

export function shouldBindAccountCookieToSessionUser(
	options: BetterAuthOptions,
): boolean {
	return hasServerAccountStore(options);
}
