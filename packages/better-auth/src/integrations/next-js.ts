import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { setShouldSkipSessionRefresh } from "../api/state/should-session-refresh";
import { parseSetCookieHeader } from "../cookies";
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
					handler: createAuthMiddleware(async () => {
						// Detect Server Component by testing if cookies can be modified.
						// In Server Components, `cookies().set()` throws an error.
						// In Server Actions or Route Handlers, it succeeds.
						let cookieStore: Awaited<
							ReturnType<typeof import("next/headers.js").cookies>
						>;
						try {
							const { cookies } = await import("next/headers.js");
							cookieStore = await cookies();
						} catch {
							// import failed or not in request context
							return;
						}
						try {
							cookieStore.set("__better-auth-cookie-store", "1", { maxAge: 0 });
							// If cookie was set successfully, we should clean up.
							cookieStore.delete("__better-auth-cookie-store");
						} catch {
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
							const { cookies } = await import("next/headers.js");
							let cookieHelper: Awaited<ReturnType<typeof cookies>>;
							try {
								cookieHelper = await cookies();
							} catch (error) {
								if (
									error instanceof Error &&
									error.message.startsWith(
										"`cookies` was called outside a request scope.",
									)
								) {
									// If error it means the `cookies` was called outside request scope.
									// NextJS docs on this: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context
									// This often gets called in a monorepo workspace (outside of NextJS),
									// so we will try to catch this suppress it, and ignore using next-cookies.
									return;
								}
								// If it's an unexpected error, throw it.
								throw error;
							}
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
									cookieHelper.set(key, value.value, opts);
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
