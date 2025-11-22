import type { CookieOptions } from "better-call";

export type BetterAuthCookies = {
	sessionToken: { name: string; options: CookieOptions };
	sessionData: { name: string; options: CookieOptions };
	accountData: { name: string; options: CookieOptions };
	dontRememberToken: { name: string; options: CookieOptions };
};
