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

export const next = () => {
	return {
		id: "next",
		hooks: {
			after: [
				{
					matcher() {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const returned = ctx.context.returned;
						if (returned instanceof Response) {
							const setCookies = returned?.headers.get("set-cookie");
							if (!setCookies) return;
							const parsed = parseSetCookieHeader(setCookies);
							const cookieHelper = await cookies();
							parsed.forEach((value, key) => {
								if (!value) return;
								if (!key) return;
								const opts = {
									...value,
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
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
