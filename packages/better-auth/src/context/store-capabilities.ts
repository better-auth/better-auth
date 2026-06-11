import type { BetterAuthOptions } from "@better-auth/core";

export function hasServerSessionStore(options: BetterAuthOptions): boolean {
	return !!options.database || !!options.secondaryStorage;
}

export function hasServerAccountStore(options: BetterAuthOptions): boolean {
	return !!options.database;
}

export function shouldBindAccountCookieToSessionUser(
	options: BetterAuthOptions,
): boolean {
	return hasServerAccountStore(options);
}
