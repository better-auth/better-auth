import { createAuthMiddleware } from "@better-auth/core/api";
import type { RequestEvent } from "@sveltejs/kit";
import { parseSetCookieHeader, toCookieOptions } from "../cookies";
import type { BetterAuthOptions, BetterAuthPlugin } from "../types";
import { PACKAGE_VERSION } from "../version";
import { warnIfCookiePluginNotLast } from "./cookie-plugin-guard";

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
	const baseURLStr =
		typeof options.baseURL === "string" ? options.baseURL : undefined;
	const baseURL = new URL(
		`${baseURLStr || _url.origin}${options.basePath || "/api/auth"}`,
	);
	// Compare hosts rather than full origins. A TLS-terminating proxy or tunnel
	// (for example ngrok) forwards plain HTTP to the app, so SvelteKit reports
	// `http://<host>` while `baseURL` is configured as `https://<host>`. The
	// scheme is not a trust boundary here; the host is, and Better Auth
	// validates it via `trustedOrigins` / `baseURL.allowedHosts` inside the
	// request handler. Comparing origins made every `/api/auth/*` request fall
	// through to SvelteKit's router and 404 behind such proxies.
	if (_url.host !== baseURL.host) return false;
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
	let hasWarned = false;

	return {
		id: "sveltekit-cookies",
		version: PACKAGE_VERSION,
		hooks: {
			after: [
				{
					matcher() {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!hasWarned) {
							warnIfCookiePluginNotLast(ctx.context, "sveltekit-cookies");
							hasWarned = true;
						}
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

							for (const [name, attributes] of parsed) {
								try {
									event.cookies.set(name, attributes.value, {
										...toCookieOptions(attributes),
										path: attributes.path || "/",
									});
								} catch {
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
