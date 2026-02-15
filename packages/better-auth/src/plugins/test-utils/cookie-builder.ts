import type { AuthContext } from "@better-auth/core";
import { makeSignature } from "../../crypto";
import type { TestCookie } from "./types";

/**
 * Signs a cookie value using HMAC-SHA256
 */
async function signCookieValue(value: string, secret: string): Promise<string> {
	const signature = await makeSignature(value, secret);
	return `${value}.${signature}`;
}

/**
 * Creates a test cookie with proper signing and attributes
 */
export async function createTestCookie(
	ctx: AuthContext,
	sessionToken: string,
	domain?: string,
): Promise<TestCookie[]> {
	const secret = ctx.secret;
	const signedToken = await signCookieValue(sessionToken, secret);

	const cookieName = ctx.authCookies.sessionToken.name;
	const cookieAttrs = ctx.authCookies.sessionToken.attributes;

	const cookies: TestCookie[] = [
		{
			name: cookieName,
			value: signedToken,
			domain: domain || getDomainFromBaseURL(ctx.baseURL),
			path: cookieAttrs.path || "/",
			httpOnly: cookieAttrs.httpOnly ?? true,
			secure: cookieAttrs.secure ?? false,
			sameSite: normalizeSameSite(cookieAttrs.sameSite),
			expires: cookieAttrs.maxAge
				? Math.floor(Date.now() / 1000) + cookieAttrs.maxAge
				: undefined,
		},
	];

	return cookies;
}

/**
 * Creates a Headers object with the cookie header set
 */
export async function createCookieHeaders(
	ctx: AuthContext,
	sessionToken: string,
): Promise<Headers> {
	const secret = ctx.secret;
	const signedToken = await signCookieValue(sessionToken, secret);
	const cookieName = ctx.authCookies.sessionToken.name;

	const headers = new Headers();
	headers.set("cookie", `${cookieName}=${signedToken}`);

	return headers;
}

function getDomainFromBaseURL(baseURL: string): string {
	try {
		const url = new URL(baseURL);
		return url.hostname;
	} catch {
		return "localhost";
	}
}

function normalizeSameSite(
	sameSite: string | boolean | undefined,
): "Lax" | "Strict" | "None" {
	if (typeof sameSite === "string") {
		const lower = sameSite.toLowerCase();
		if (lower === "strict") return "Strict";
		if (lower === "none") return "None";
	}
	return "Lax";
}
