import { serializeSignedCookie } from "better-call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { parseSetCookieHeader } from "../../cookies";
import { createAuthEndpoint, createAuthMiddleware } from "../../api";
import { createHMAC } from "@better-auth/utils/hmac";

interface BearerOptions {
	/**
	 * If true, only signed tokens
	 * will be converted to session
	 * cookies
	 *
	 * @default false
	 */
	requireSignature?: boolean;
	/**
	 * Custom cookie name for the temporary bearer token confirmation cookie.
	 *
	 * @default "bearer-token-confirmation"
	 */
	cookieName?: string;
}

/**
 * Converts bearer token to session cookie
 */
export const bearer = (options?: BearerOptions) => {
	const bearerConfirmationCookieName =
		options?.cookieName || "bearer-token-confirmation";
	return {
		id: "bearer",
		endpoints: {
			getBearerToken: createAuthEndpoint(
				"/get-bearer-token",
				{
					method: "GET",
					metadata: {
						client: false,
					},
					requireHeaders: true,
				},
				async (ctx) => {
					const cookieString = ctx.headers.get("cookie");
					if (!cookieString) {
						return ctx.json({
							success: false,
						});
					}
					const cookies = cookieString
						.split(";")
						.map((cookie) => cookie.trim());
					const foundBearerToken = cookies.find((cookie) =>
						cookie.startsWith(`${bearerConfirmationCookieName}=`),
					);
					const foundSessionToken = cookies.find((cookie) =>
						cookie.startsWith(ctx.context.authCookies.sessionToken.name),
					);
					if (foundBearerToken && foundSessionToken) {
						const setCookie = foundSessionToken.split("=")[1];
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
						ctx.setHeader("set-auth-token", token);
						// Delete the confirmation cookie
						ctx.setCookie(bearerConfirmationCookieName, "", {
							httpOnly: true,
							sameSite: "strict",
							maxAge: 0,
							expires: new Date(0),
						});
						return ctx.json({
							success: true,
						});
					}
					return ctx.json({
						success: false,
					});
				},
			),
		},
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
								decodedToken.split(".")[0],
								decodedToken.split(".")[1],
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
						const location =
							ctx.context.responseHeaders?.get("location") ||
							ctx.context.responseHeaders?.get("Location");
						// If location exists, it likely means the authClient isn't able to pick up the bearer token.
						// We will store a "bearer-token-confirmation" cookie so that when the authClient loads it can hit the
						// `/get-bearer-token` endpoint and check for it, then delete it and return the bearer token.
						if (location) {
							// set a temporary cookie that will be used to get the bearer token
							ctx.setCookie(bearerConfirmationCookieName, "true", {
								httpOnly: true,
								sameSite: "strict",
								secure: true,
							});
						}
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
