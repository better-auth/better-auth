import type { CookieOptions } from "better-call";

export type BetterAuthCookie = { name: string; attributes: CookieOptions };

export type BetterAuthCookies = {
	sessionToken: BetterAuthCookie;
	sessionData: BetterAuthCookie;
	accountData: BetterAuthCookie;
	sessionOnlyToken: BetterAuthCookie;
};
