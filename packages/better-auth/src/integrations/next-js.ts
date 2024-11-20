import type { BetterAuthPlugin } from "../types";
import { cookies } from "next/headers";
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
	};
}

export const nextCookies = () => {
	return {
		id: "next-cookies",
		hooks: {
			after: [
				{
					matcher(ctx) {
						return true;
					},
					handler: async (ctx) => {
						const returned = ctx.responseHeader;
						if (returned instanceof Headers) {
							const setCookies = returned?.get("set-cookie");
							if (!setCookies) return;
							const parsed = parseSetCookieHeader(setCookies);
							const cookieHelper = await cookies();
							parsed.forEach((value, key) => {
								if (!key) return;
								const opts = {
									sameSite: value.samesite,
									secure: value.secure,
									maxAge: value["max-age"],
									httpOnly: value.httponly,
									domain: value.domain,
									path: value.path,
								};
								try {
									cookieHelper.set(key, decodeURIComponent(value.value), opts);
								} catch {
									if (process.env.NODE_ENV !== "development") {
										return;
									}
								}
							});
							return;
						}
					},
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
