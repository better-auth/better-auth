import { serializeSigned } from "better-call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { parseSetCookieHeader } from "../../cookies";
import { createAuthMiddleware } from "../../api";

/**
 * Converts bearer token to session cookie
 */
export const bearer = () => {
	return {
		id: "bearer",
		hooks: {
			before: [
				{
					matcher(context) {
						return Boolean(
							context.request?.headers.get("authorization") ||
								context.headers?.get("authorization"),
						);
					},
					handler: async (c) => {
						const token =
							c.request?.headers.get("authorization")?.replace("Bearer ", "") ||
							c.headers?.get("authorization")?.replace("Bearer ", "");
						if (!token || !token.includes(".")) {
							return;
						}
						if (c.request) {
							c.request.headers.set(
								"cookie",
								`${c.context.authCookies.sessionToken.name}=${token.replace(
									"=",
									"",
								)}`,
							);
						}
						if (c.headers) {
							c.headers.set(
								"cookie",
								`${c.context.authCookies.sessionToken.name}=${token.replace(
									"=",
									"",
								)}`,
							);
						}
						return {
							context: c,
						};
					},
				},
			],
			after: [
				{
					matcher(context) {
						return !!context.responseHeader.get("set-cookie");
					},
					handler: createAuthMiddleware(async (ctx) => {
						const setCookie = ctx.responseHeader.get("set-cookie");
						if (!setCookie) {
							return;
						}
						const parsedCookies = parseSetCookieHeader(setCookie);
						const cookieName = ctx.context.authCookies.sessionToken.name;
						const sessionCookie = parsedCookies.get(cookieName);
						if (
							!sessionCookie ||
							!sessionCookie.value ||
							sessionCookie["max-age"] === 0
						) {
							return;
						}
						const token = sessionCookie.value;
						ctx.responseHeader.set("set-auth-token", token);
						return {
							responseHeader: ctx.responseHeader,
						};
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
