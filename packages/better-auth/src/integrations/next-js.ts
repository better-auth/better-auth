import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { setShouldSkipSessionRefresh } from "../api/state/should-session-refresh";
import { parseSetCookieHeader, toCookieOptions } from "../cookies";
import { PACKAGE_VERSION } from "../version";
import { warnIfCookiePluginNotLast } from "./cookie-plugin-guard";

export interface NextJsHandlerOptions {
	/**
	 * The `basePath` configured in `next.config`.
	 *
	 * Next.js strips its `basePath` from the URL that App Router route
	 * handlers receive. When the Better Auth `basePath` includes that prefix
	 * (e.g. `/docs/api/auth`), the handler restores it before routing.
	 *
	 * Defaults to the value Next.js injects at build time.
	 */
	basePath?: string | undefined;
}

type NextJsHandlerAuthContext = Promise<{
	baseURL: string;
	options: { basePath?: string | undefined };
}>;

type NextJsHandlerAuth =
	| {
			handler: (request: Request) => Promise<Response>;
			$context?: NextJsHandlerAuthContext | undefined;
	  }
	| ((request: Request) => Promise<Response>);

const trimTrailingSlashes = (path: string) => path.replace(/\/+$/, "");

const hasPathPrefix = (pathname: string, prefix: string) =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);

function getNextBasePath(): string | undefined {
	try {
		// Kept as a literal member expression so the Next.js compiler can replace it.
		return process.env.__NEXT_ROUTER_BASEPATH;
	} catch {
		return undefined;
	}
}

async function getAuthBasePath(context: NextJsHandlerAuthContext) {
	const ctx = await context;
	if (ctx.baseURL) {
		try {
			return trimTrailingSlashes(new URL(ctx.baseURL).pathname);
		} catch {}
	}
	return trimTrailingSlashes(ctx.options.basePath || "/api/auth");
}

/**
 * Next.js removes its `basePath` from the URL passed to App Router route
 * handlers. Restore it when the Better Auth `basePath` expects it, so the
 * router matches and generated URLs keep the public prefix.
 *
 * @see https://github.com/better-auth/better-auth/issues/11910
 */
async function restoreNextBasePath(
	request: Request,
	auth: NextJsHandlerAuth,
	nextBasePath: string | undefined,
) {
	const prefix = trimTrailingSlashes(nextBasePath ?? "");
	if (!prefix || !("handler" in auth) || !auth.$context) {
		return request;
	}
	const url = new URL(request.url);
	if (hasPathPrefix(url.pathname, prefix)) {
		return request;
	}
	const authBasePath = await getAuthBasePath(auth.$context);
	const restoredPathname = `${prefix}${url.pathname}`;
	if (
		!hasPathPrefix(authBasePath, prefix) ||
		!hasPathPrefix(restoredPathname, authBasePath)
	) {
		return request;
	}
	url.pathname = restoredPathname;
	return new Request(url, request);
}

export function toNextJsHandler(
	auth: NextJsHandlerAuth,
	options?: NextJsHandlerOptions,
) {
	const nextBasePath =
		options?.basePath !== undefined ? options.basePath : getNextBasePath();
	const handler = async (request: Request) => {
		const req = await restoreNextBasePath(request, auth, nextBasePath);
		return "handler" in auth ? auth.handler(req) : auth(req);
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
						let headersStore: Awaited<ReturnType<NextHeadersModule["headers"]>>;
						try {
							const { headers } = await loadNextHeadersModule();
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
						const isRSC = headersStore.get("RSC") === "1";
						const isServerAction = !!headersStore.get("next-action");
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
