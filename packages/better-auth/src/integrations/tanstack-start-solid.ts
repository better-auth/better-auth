import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { parseSetCookieHeader } from "../cookies";

/**
 * TanStack Start cookie plugin for Solid.js.
 *
 * This plugin automatically handles cookie setting for TanStack Start with Solid.js.
 * It uses `@tanstack/solid-start-server` to set cookies.
 *
 * For React, use `better-auth/tanstack-start` instead.
 *
 * @example
 * ```ts
 * import { tanstackStartCookies } from "better-auth/tanstack-start/solid";
 *
 * const auth = betterAuth({
 *   plugins: [tanstackStartCookies()],
 * });
 * ```
 */
export const tanstackStartCookies = () => {
	return {
		id: "tanstack-start-cookies-solid",
		hooks: {
			after: [
				{
					matcher(ctx) {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const returned = ctx.context.responseHeaders;
						if ("_flag" in ctx && ctx._flag === "router") {
							return;
						}
						if (returned instanceof Headers) {
							const setCookies = returned?.get("set-cookie");
							if (!setCookies) return;
							const parsed = parseSetCookieHeader(setCookies);
							const { setCookie } = await import(
								"@tanstack/solid-start-server"
							);
							parsed.forEach((value, key) => {
								if (!key) return;
								const opts = {
									sameSite: value.samesite,
									secure: value.secure,
									maxAge: value["max-age"],
									httpOnly: value.httponly,
									domain: value.domain,
									path: value.path,
								} as const;
								try {
									setCookie(key, decodeURIComponent(value.value), opts);
								} catch {
									// this will fail if the cookie is being set on server component
								}
							});
							return;
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
