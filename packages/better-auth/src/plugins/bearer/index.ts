import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { createHMAC } from "@better-auth/utils/hmac";
import { serializeSignedCookie } from "better-call";
import { parseSetCookieHeader } from "../../cookies";

interface BearerOptions {
	/**
	 * If true, only signed tokens
	 * will be converted to session
	 * cookies
	 *
	 * @default false
	 */
	requireSignature?: boolean | undefined;
}

/**
 * Converts bearer token to session cookie
 */
export const bearer = (options?: BearerOptions | undefined) => {
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
					handler: createAuthMiddleware(async (c) => {
						const token =
							c.request?.headers.get("authorization")?.replace("Bearer ", "") ||
							c.headers?.get("Authorization")?.replace("Bearer ", "");
						if (!token) {
							return;
						}

						let signedToken = "";
						if (token.includes(".")) {
							signedToken = token.replace("=", "");
						} else {
							if (options?.requireSignature) {
								return;
							}
							signedToken = (
								await serializeSignedCookie("", token, c.context.secret)
							).replace("=", "");
						}
						try {
							const decodedToken = decodeURIComponent(signedToken);
							const isValid = await createHMAC(
								"SHA-256",
								"base64urlnopad",
							).verify(
								c.context.secret,
								decodedToken.split(".")[0]!,
								decodedToken.split(".")[1]!,
							);
							if (!isValid) {
								return;
							}
						} catch (e) {
							return;
						}
						const existingHeaders = (c.request?.headers ||
							c.headers) as Headers;
						const headers = new Headers({
							...Object.fromEntries(existingHeaders?.entries()),
						});
						headers.append(
							"cookie",
							`${c.context.authCookies.sessionToken.name}=${signedToken}`,
						);
						return {
							context: {
								headers,
							},
						};
					}),
				},
			],
			after: [
				{
					matcher(context) {
						return true;
					},
					handler: createAuthMiddleware(async (ctx) => {
						const setCookie = ctx.context.responseHeaders?.get("set-cookie");
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
						const exposedHeaders =
							ctx.context.responseHeaders?.get(
								"access-control-expose-headers",
							) || "";
						const headersSet = new Set(
							exposedHeaders
								.split(",")
								.map((header) => header.trim())
								.filter(Boolean),
						);
						headersSet.add("set-auth-token");
						ctx.setHeader("set-auth-token", token);
						ctx.setHeader(
							"Access-Control-Expose-Headers",
							Array.from(headersSet).join(", "),
						);
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
