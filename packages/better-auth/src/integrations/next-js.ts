import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { setShouldSkipSessionRefresh } from "../api/state/should-session-refresh";
import { parseSetCookieHeader, toCookieOptions } from "../cookies";
import { PACKAGE_VERSION } from "../version";

/**
 * Re-create a standard Request with `duplex: 'half'` so that streaming
 * bodies work in Next.js App Router route handlers.
 *
 * Next.js may hand the handler a Request whose body is a ReadableStream,
 * but the runtime sometimes loses the internal "disturbed" flag when the
 * request is forwarded between layers. Constructing a fresh Request with
 * `duplex: 'half'` ensures the body stream is treated correctly.
 */
function toPlainRequest(req: Request): Request {
	const hasBody = req.method !== "GET" && req.method !== "HEAD";
	return new Request(req.url, {
		method: req.method,
		headers: new Headers(req.headers),
		...(hasBody && {
			body: req.body,
			duplex: "half",
		}),
	} as RequestInit);
}

export function toNextJsHandler(
	auth:
		| {
				handler: (request: Request) => Promise<Response>;
		  }
		| ((request: Request) => Promise<Response>),
) {
	const handler = async (request: Request) => {
		const hasBody =
			request.method !== "GET" &&
			request.method !== "HEAD" &&
			request.body != null;
		const effectiveRequest = hasBody ? toPlainRequest(request) : request;
		return "handler" in auth ? auth.handler(effectiveRequest) : auth(effectiveRequest);
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
