import type { CookieOptions } from "better-call";
import type { Session, User } from "../db";

export type BetterAuthCookie = { name: string; attributes: CookieOptions };

export type BetterAuthCookies = {
	sessionToken: BetterAuthCookie;
	sessionData: BetterAuthCookie;
	accountData: BetterAuthCookie;
	dontRememberToken: BetterAuthCookie;
};

/**
 * A validated cookie-cache payload, including legacy payloads without a version.
 */
export type CookieCachePayload = {
	session: Session & Record<string, unknown>;
	user: User & Record<string, unknown>;
	updatedAt: number;
	version?: string | undefined;
};
