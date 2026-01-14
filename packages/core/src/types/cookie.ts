import type { CookieOptions } from "better-call";

export type BetterAuthCookie = { name: string; options: CookieOptions };

export type BetterAuthCookies = {
	sessionToken: BetterAuthCookie;
	sessionData: BetterAuthCookie;
	accountData: BetterAuthCookie;
	dontRememberToken: BetterAuthCookie;
};
