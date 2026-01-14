import type { CookieOptions } from "better-call";

// TODO: keep only one of options or attributes
export type BetterAuthCookie =
	| { name: string; options: CookieOptions }
	| { name: string; attributes: CookieOptions };

export type BetterAuthCookies = {
	sessionToken: { name: string; options: CookieOptions };
	sessionData: { name: string; options: CookieOptions };
	accountData: { name: string; options: CookieOptions };
	dontRememberToken: { name: string; options: CookieOptions };
};
