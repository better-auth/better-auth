import type { Context, CookieOptions } from "better-call";
import { TimeSpan } from "oslo";
import type { BetterAuthOptions } from "../types/options";
import type { GenericEndpointContext } from "../types/context";

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
		dontRememberToken: {
			name: `${secureCookiePrefix}${cookiePrefix}.dont_remember`,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure,
				//no max age so it expires when the browser closes
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

export async function setSessionCookie(
	ctx: GenericEndpointContext,
	sessionToken: string,
	dontRememberMe?: boolean,
	overrides?: Partial<CookieOptions>,
) {
	await ctx.setSignedCookie(
		ctx.context.authCookies.sessionToken.name,
		sessionToken,
		ctx.context.secret,
		dontRememberMe
			? {
					...ctx.context.authCookies.sessionToken.options,
					maxAge: undefined,
					...overrides,
				}
			: {
					...ctx.context.authCookies.sessionToken.options,
					...overrides,
				},
	);
	if (dontRememberMe) {
		await ctx.setSignedCookie(
			ctx.context.authCookies.dontRememberToken.name,
			"true",
			ctx.context.secret,
			ctx.context.authCookies.dontRememberToken.options,
		);
	}
}

export function deleteSessionCookie(ctx: GenericEndpointContext) {
	ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
		maxAge: 0,
	});
	ctx.setCookie(ctx.context.authCookies.dontRememberToken.name, "", {
		maxAge: 0,
	});
}

type CookieAttributes = {
	value: string;
	[key: string]: string | boolean;
};

export function parseSetCookieHeader(
	header: string,
): Map<string, CookieAttributes> {
	const cookieMap = new Map<string, CookieAttributes>();

	// Split the header into individual cookies
	const cookies = header.split(", ");

	// biome-ignore lint/complexity/noForEach: <explanation>
	cookies.forEach((cookie) => {
		const [nameValue, ...attributes] = cookie.split("; ");
		const [name, value] = nameValue.split("=");

		const cookieObj: CookieAttributes = { value };

		// biome-ignore lint/complexity/noForEach: <explanation>
		attributes.forEach((attr) => {
			const [attrName, attrValue] = attr.split("=");
			cookieObj[attrName.toLowerCase()] = attrValue || true;
		});

		cookieMap.set(name, cookieObj);
	});

	return cookieMap;
}
