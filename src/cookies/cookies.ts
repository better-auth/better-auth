import type { BetterAuthOptions } from "../options";
import { timeSpan } from "../utils/time";
import type { CookieSerializeOptions } from "./types";

export function getCookies(options: BetterAuthOptions) {
	const secure = !!options.advanced?.useSecureCookies;
	const secureCookiePrefix = secure ? "__Secure-" : "";
	const cookiePrefix = "better-auth";
	return {
		sessionToken: {
			name: `${secureCookiePrefix}${cookiePrefix}.session_token`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				maxAge: options.session?.expiresIn || timeSpan("7d"),
				...options.advanced?.sessionCookie,
			} satisfies CookieSerializeOptions,
		},
		csrfToken: {
			name: `${secureCookiePrefix}${cookiePrefix}.csrf_token`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
			} satisfies CookieSerializeOptions,
		},
		state: {
			name: `${secureCookiePrefix}${cookiePrefix}.state`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				maxAge: 60 * 15, // 15 minutes in seconds
			} satisfies CookieSerializeOptions,
		},
		pkCodeVerifier: {
			name: `${secureCookiePrefix}${cookiePrefix}.pk_code_verifier`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				maxAge: 60 * 15, // 15 minutes in seconds
			} as CookieSerializeOptions,
		},
		nonce: {
			name: `${secureCookiePrefix}${cookiePrefix}.nonce`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				maxAge: 60 * 15, // 15 minutes in seconds
			} as CookieSerializeOptions,
		},
	};
}

export type BetterAuthCookies = ReturnType<typeof getCookies>;
