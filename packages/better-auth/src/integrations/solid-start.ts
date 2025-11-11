import type { BetterAuthPlugin } from "@better-auth/core";
import { parseSetCookieHeader } from "../cookies";
import { createAuthMiddleware } from "@better-auth/core/middleware";

export function toSolidStartHandler(
	auth:
		| {
				handler: (request: Request) => Promise<Response>;
		  }
		| ((request: Request) => Promise<Response>),
) {
	const handler = async (event: { request: Request }) => {
		return "handler" in auth
			? auth.handler(event.request)
			: auth(event.request);
	};
	return {
		GET: handler,
		POST: handler,
	};
}

export const solidStartCookies = () => {
	return {
		id: "solid-start-cookies",
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
							const parsed = parseSetCookieHeader(setCookies);
							const { setCookie } = await import("vinxi/http");
							parsed.forEach((value, key) => {
								try {
									setCookie(key, decodeURIComponent(value.value), {
										sameSite: value.samesite,
										secure: value.secure,
										maxAge: value["max-age"],
										httpOnly: value.httponly,
										domain: value.domain,
										path: value.path,
									});
								} catch (e) {
									// this will avoid any issue related to already streamed response
								}
							});
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
