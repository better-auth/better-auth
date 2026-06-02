import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { parseSetCookieHeader, toCookieOptions } from "../cookies";
import { PACKAGE_VERSION } from "../version";
import { warnIfCookiePluginNotLast } from "./cookie-plugin-guard";

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
		// Keep GET /get-session read-only so RSC navigation never writes to the
		// DB. Cookies cannot be written during an RSC render, so a GET-side
		// refresh would only drift the DB ahead of the stale cookie. The client
		// re-issues the refresh as a POST, where cookies are writable. The RSC
		// context cannot be detected from request headers.
		// @see .postmortem/rsc-header-detection.md
		init() {
			// `defu` preserves an explicit user value, so this applies only when
			// `deferSessionRefresh` is unset. Escape hatch: set it to `false`.
			return {
				options: { session: { deferSessionRefresh: true } },
			};
		},
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
