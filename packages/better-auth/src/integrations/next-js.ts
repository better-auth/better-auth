import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { setShouldSkipSessionRefresh } from "../api/state/should-session-refresh";
import { parseSetCookieHeader } from "../cookies";

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
	return {
		id: "next-cookies",
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
							ReturnType<typeof import("next/headers").cookies>
						>;
						try {
							const { cookies } = await import("next/headers");
							cookieStore = await cookies();
						} catch {
							// import failed or not in request context
							return;
						}
						try {
							cookieStore.set("__better-auth-cookie-store", "1", { maxAge: 0 });
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
							const { cookies } = await import("next/headers");
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
									cookieHelper.set(key, decodeURIComponent(value.value), opts);
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
