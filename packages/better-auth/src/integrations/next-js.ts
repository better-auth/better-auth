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

type NextHeadersModule = typeof import("next/headers.js");

let nextHeadersModulePromise: Promise<NextHeadersModule> | undefined;

/**
 * Cache ESM resolution while leaving the request-scoped `headers()` and
 * `cookies()` calls uncached.
 *
 * @see https://github.com/better-auth/better-auth/issues/10466
 */
const loadNextHeadersModule = () => {
	nextHeadersModulePromise ??= import("next/headers.js").catch(
		(error: unknown) => {
			nextHeadersModulePromise = undefined;
			throw error;
		},
	);
	return nextHeadersModulePromise;
};

export const nextCookies = () => {
	let hasWarned = false;

	return {
		id: "next-cookies",
		version: PACKAGE_VERSION,
		hooks: {
			after: [
				{
					matcher(ctx) {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!hasWarned) {
							warnIfCookiePluginNotLast(ctx.context, "next-cookies");
							hasWarned = true;
						}
						const returned = ctx.context.responseHeaders;
						if ("_flag" in ctx && ctx._flag === "router") {
							return;
						}
						if (returned instanceof Headers) {
							const setCookies = returned?.get("set-cookie");
							if (!setCookies) return;
							const parsed = parseSetCookieHeader(setCookies);
							let cookieHelper: Awaited<
								ReturnType<NextHeadersModule["cookies"]>
							>;
							try {
								const { cookies } = await loadNextHeadersModule();
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
