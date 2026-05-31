import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { setShouldSkipSessionRefresh } from "../api/state/should-session-refresh";
import { parseSetCookieHeader, toCookieOptions } from "../cookies";
import { PACKAGE_VERSION } from "../version";
import { warnIfCookiePluginNotLast } from "./cookie-plugin-guard";

/**
 * Returns Next.js middleware request options that forward RSC context headers.
 *
 * Next.js middleware strips internal routing headers (`RSC`, `next-action`,
 * etc.) before forwarding requests to the app router. Without these headers,
 * the `nextCookies()` plugin cannot detect RSC navigation and will perform
 * unnecessary session refreshes (extra DB writes) that cannot be reflected
 * back in cookies.
 *
 * Pass the return value to `NextResponse.next()` in your middleware:
 *
 * @example
 * ```ts
 * import { NextResponse } from "next/server";
 * import type { NextRequest } from "next/server";
 * import { nextCookiesMiddleware } from "better-auth/next-js";
 *
 * export function middleware(request: NextRequest) {
 *   return NextResponse.next(nextCookiesMiddleware(request));
 * }
 * ```
 */
export function nextCookiesMiddleware(request: { headers: Headers }): {
	request: { headers: Headers };
} {
	const headers = new Headers(request.headers);
	if (headers.get("RSC") === "1") {
		headers.set("x-better-auth-is-rsc", "1");
	}
	if (headers.has("next-action")) {
		headers.set("x-better-auth-is-server-action", "1");
	}
	return { request: { headers } };
}

export function toNextJsHandler(
	auth:
		| {
				handler: (request: Request) => Promise<Response>;
		  }
		| ((request: Request) => Promise<Response>),
) {
	const handler = async (request: Request) => {
		return "handler" in auth ? auth.handler(request) : auth(request);
	};
	return {
		GET: handler,
		POST: handler,
		PATCH: handler,
		PUT: handler,
		DELETE: handler,
	};
}

export const nextCookies = () => {
	let hasWarned = false;

	return {
		id: "next-cookies",
		version: PACKAGE_VERSION,
		hooks: {
			before: [
				{
					matcher(ctx) {
						return ctx.path === "/get-session";
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!hasWarned) {
							warnIfCookiePluginNotLast(ctx.context, "next-cookies");
							hasWarned = true;
						}
						// Real HTTP requests (via router) set cookies through
						// response headers -- no need to skip refresh.
						if ("_flag" in ctx && ctx._flag === "router") {
							return;
						}
						let headersStore: Awaited<
							ReturnType<typeof import("next/headers.js").headers>
						>;
						try {
							const { headers } = await import("next/headers.js");
							headersStore = await headers();
						} catch {
							return;
						}
						/**
						 * Detect RSC via headers, NOT by probing cookies().set().
						 * In Next.js, cookies().set() unconditionally triggers router
						 * cache invalidation -- even if the value is unchanged.
						 *
						 * RSC sends `RSC: 1` without `next-action`. Only in that
						 * context cookies cannot be written -- skip session refresh
						 * to avoid DB/cookie mismatch.
						 *
						 * @see https://github.com/vercel/next.js/blob/8c5af211d580/packages/next/src/server/web/spec-extension/adapters/request-cookies.ts#L112-L157
						 */
						// Also check x-better-auth-is-rsc / x-better-auth-is-server-action
						// for apps using nextCookiesMiddleware() — Next.js strips the
						// native RSC/next-action headers during the middleware→app transition.
						const isRSC =
							headersStore.get("RSC") === "1" ||
							headersStore.get("x-better-auth-is-rsc") === "1";
						const isServerAction =
							!!headersStore.get("next-action") ||
							!!headersStore.get("x-better-auth-is-server-action");
						if (isRSC && !isServerAction) {
							await setShouldSkipSessionRefresh(true);
						}
					}),
				},
			],
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
							let cookieHelper: Awaited<
								ReturnType<typeof import("next/headers.js").cookies>
							>;
							try {
								const { cookies } = await import("next/headers.js");
								cookieHelper = await cookies();
							} catch (error) {
								if (
									error instanceof Error &&
									(error.message.startsWith(
										"`cookies` was called outside a request scope.",
									) ||
										error.message.includes("Cannot find module"))
								) {
									// Monorepo workspaces outside of Next.js hit this path.
									// @see https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
									return;
								}
								throw error;
							}
							parsed.forEach((value, key) => {
								if (!key) return;
								try {
									cookieHelper.set(key, value.value, toCookieOptions(value));
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
