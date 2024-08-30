import type { CookieOptions } from "better-call";
import { TimeSpan } from "oslo";
import type { BetterAuthOptions } from "../types/options";

export function getCookies(options: BetterAuthOptions) {
	const secure =
		!!options.advanced?.useSecureCookies ||
		process.env.NODE_ENV === "production";
	const secureCookiePrefix = secure ? "__Secure-" : "";
	const cookiePrefix = "better-auth";
	const sessionMaxAge = new TimeSpan(7, "d").seconds();
	return {
		sessionToken: {
			name: `${secureCookiePrefix}${cookiePrefix}.session_token`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				maxAge: sessionMaxAge,
			} satisfies CookieOptions,
		},
		csrfToken: {
			name: `${secureCookiePrefix ? "__Host-" : ""}${cookiePrefix}.csrf_token`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				maxAge: 60 * 60 * 24 * 7,
			} satisfies CookieOptions,
		},
		state: {
			name: `${secureCookiePrefix}${cookiePrefix}.state`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				maxAge: 60 * 15, // 15 minutes in seconds
			} satisfies CookieOptions,
		},
		pkCodeVerifier: {
			name: `${secureCookiePrefix}${cookiePrefix}.pk_code_verifier`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				maxAge: 60 * 15, // 15 minutes in seconds
			} as CookieOptions,
		},
		nonce: {
			name: `${secureCookiePrefix}${cookiePrefix}.nonce`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				maxAge: 60 * 15, // 15 minutes in seconds
			} as CookieOptions,
		},
	};
}

export function createCookieGetter(options: BetterAuthOptions) {
	const secure =
		!!options.advanced?.useSecureCookies ||
		process.env.NODE_ENV === "production";
	const secureCookiePrefix = secure ? "__Secure-" : "";
	const cookiePrefix = "better-auth";
	function getCookie(cookieName: string, options?: CookieOptions) {
		return {
			name:
				process.env.NODE_ENV === "production"
					? `${secureCookiePrefix}${cookiePrefix}.${cookieName}`
					: `${cookiePrefix}.${cookieName}`,
			options: {
				secure,
				sameSite: "lax",
				path: "/",
				maxAge: 60 * 15, // 15 minutes in seconds
				...options,
			} as CookieOptions,
		};
	}
	return getCookie;
}
export type BetterAuthCookies = ReturnType<typeof getCookies>;
