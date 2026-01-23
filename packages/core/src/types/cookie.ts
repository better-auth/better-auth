import type { Session, User } from "@better-auth/core/db";
import type { CookieOptions } from "better-call";

export type BetterAuthCookie = { name: string; attributes: CookieOptions };

export type BetterAuthCookies = {
	sessionToken: BetterAuthCookie;
	sessionData: BetterAuthCookie;
	accountData: BetterAuthCookie;
	dontRememberToken: BetterAuthCookie;
};

export type SessionCookieData = {
	session: Session & Record<string, any>;
	user: User & Record<string, any>;
	updatedAt: number;
	version?: string;
};
