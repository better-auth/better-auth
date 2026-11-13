import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { setCookieCache } from "../../cookies";
import { parseSetCookieHeader } from "../../cookies/cookie-utils";
import { makeSignature } from "../../crypto";
import type { TestCookie } from "./types";

type TestSession = Parameters<typeof setCookieCache>[1];

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
	session: TestSession,
	domain?: string,
): Promise<TestCookie[]> {
	const secret = ctx.secret;
	const signedToken = await signCookieValue(session.session.token, secret);

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

	if (ctx.options.session?.cookieCache?.enabled) {
		const createCacheCookies = createAuthEndpoint.serverOnly(
			{ method: "GET" },
			async (endpointCtx) => {
				await setCookieCache(endpointCtx, session, false);
			},
		);
		const { headers } = await createCacheCookies({
			context: ctx,
			returnHeaders: true,
		});
		for (const [name, attributes] of parseSetCookieHeader(
			headers.get("set-cookie") || "",
		)) {
			cookies.push({
				name,
				value: attributes.value,
				domain:
					domain || attributes.domain || getDomainFromBaseURL(ctx.baseURL),
				path: attributes.path || "/",
				httpOnly: attributes.httponly ?? false,
				secure: attributes.secure ?? false,
				sameSite: normalizeSameSite(attributes.samesite),
				expires:
					attributes["max-age"] !== undefined
						? Math.floor(Date.now() / 1000) + attributes["max-age"]
						: attributes.expires
							? Math.floor(attributes.expires.getTime() / 1000)
							: undefined,
			});
		}
	}

	return cookies;
}

/**
 * Creates a Headers object from existing cookies
 */
export function createCookieHeaders(cookies: readonly TestCookie[]): Headers {
	const headers = new Headers();
	headers.set(
		"cookie",
		cookies.map(({ name, value }) => `${name}=${value}`).join("; "),
	);

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
