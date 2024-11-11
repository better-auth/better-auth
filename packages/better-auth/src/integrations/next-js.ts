import type { BetterAuthPlugin } from "../types";
import { cookies } from "next/headers";
import { parseSetCookieHeader } from "../cookies";
import { createAuthMiddleware } from "../plugins";

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
	};
}

export const nextCookies = () => {
	return {
		id: "next-cookies",
		hooks: {
			after: [
				{
					matcher() {
						return true;
					},
					handler: async (ctx) => {
						const returned = ctx.context.endpoint?.headers;
						if (returned instanceof Headers) {
							const setCookies = returned?.get("set-cookie");
							if (!setCookies) return;
							const parsed = parseSetCookieHeader(setCookies);
							const cookieHelper = await cookies();
							parsed.forEach((value, key) => {
								if (!value) return;
								if (!key) return;
								const opts = {
									samesite: value.samesite,
									secure: value.secure,
									"max-age": value["max-age"],
									httponly: value.httponly,
									domain: value.domain,
									path: value.path,
								};
								cookieHelper.set(key, decodeURIComponent(value.value), opts);
							});
							return;
						}
					},
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
