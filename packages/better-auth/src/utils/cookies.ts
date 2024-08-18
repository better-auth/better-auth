import { CookieOptions } from "better-call";
import { BetterAuthOptions } from "../types/options";
import { TimeSpan } from "oslo";

export function getCookies(options: BetterAuthOptions) {
	const secure = !!options.advanced?.useSecureCookies;
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

export type BetterAuthCookies = ReturnType<typeof getCookies>;
