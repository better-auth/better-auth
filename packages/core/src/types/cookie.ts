import type { CookieOptions } from "better-call";

export type BetterAuthCookie = {
	name: string;
	attributes: CookieOptions;
	/**
	 * @deprecated Use `attributes` instead. This alias is kept for backward compatibility.
	 */
	options: CookieOptions;
};

export type BetterAuthCookies = {
	sessionToken: BetterAuthCookie;
	sessionData: BetterAuthCookie;
	accountData: BetterAuthCookie;
	dontRememberToken: BetterAuthCookie;
};
