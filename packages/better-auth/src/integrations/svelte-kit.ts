import { createAuthMiddleware } from "@better-auth/core/api";
import type { RequestEvent } from "@sveltejs/kit";
import { parseSetCookieHeader } from "../cookies";
import type { BetterAuthOptions, BetterAuthPlugin } from "../types";

export const toSvelteKitHandler = (auth: {
	handler: (request: Request) => Response | Promise<Response>;
	options: BetterAuthOptions;
}) => {
	return (event: { request: Request }) => auth.handler(event.request);
};

export const svelteKitHandler = async ({
	auth,
	event,
	resolve,
	building,
}: {
	auth: {
		handler: (request: Request) => Response | Promise<Response>;
		options: BetterAuthOptions;
	};
	event: RequestEvent;
	resolve: (event: RequestEvent) => Response | Promise<Response>;
	building: boolean;
}) => {
	if (building) {
		return resolve(event);
	}
	const { request, url } = event;
	if (isAuthPath(url.toString(), auth.options)) {
		return auth.handler(request);
	}
	return resolve(event);
};

export function isAuthPath(url: string, options: BetterAuthOptions) {
	const _url = new URL(url);
	const baseURL = new URL(
		`${options.baseURL || _url.origin}${options.basePath || "/api/auth"}`,
	);
	if (_url.origin !== baseURL.origin) return false;
	if (
		!_url.pathname.startsWith(
			baseURL.pathname.endsWith("/")
				? baseURL.pathname
				: `${baseURL.pathname}/`,
		)
	)
		return false;
	return true;
}

export const sveltekitCookies = (
	getRequestEvent: () => RequestEvent<any, any>,
) => {
	return {
		id: "sveltekit-cookies",
		hooks: {
			after: [
				{
					matcher() {
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
							const event = getRequestEvent();
							if (!event) return;
							const parsed = parseSetCookieHeader(setCookies);

							for (const [name, { value, ...ops }] of parsed) {
								try {
									event.cookies.set(name, decodeURIComponent(value), {
										sameSite: ops.samesite,
										path: ops.path || "/",
										expires: ops.expires,
										secure: ops.secure,
										httpOnly: ops.httponly,
										domain: ops.domain,
										maxAge: ops["max-age"],
									});
								} catch (e) {
									// this will avoid any issue related to already streamed response
								}
							}
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
