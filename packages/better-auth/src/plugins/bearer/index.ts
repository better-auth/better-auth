import { serializeSigned } from "better-call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { parseSetCookieHeader } from "../../cookies";
import { createAuthMiddleware } from "../../api";
import { createHMAC } from "@better-auth/utils/hmac";

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
						const sessionToken = token.replace("=", "");
						try {
							const decodedToken = decodeURIComponent(sessionToken);
							const isValid = await createHMAC(
								"SHA-256",
								"base64urlnopad",
							).verify(
								c.context.secret,
								decodedToken.split(".")[0],
								decodedToken.split(".")[1],
							);
							if (!isValid) {
								return;
							}
						} catch (e) {
							return;
						}
						if (c.request) {
							c.request.headers.append(
								"cookie",
								`${c.context.authCookies.sessionToken.name}=${sessionToken}`,
							);
						}
						if (c.headers) {
							c.headers.append(
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
