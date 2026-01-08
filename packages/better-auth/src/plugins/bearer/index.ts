import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { createHMAC } from "@better-auth/utils/hmac";
import { serializeSignedCookie } from "better-call";
import { parseSetCookieHeader } from "../../cookies";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		bearer: {
			creator: typeof bearer;
		};
	}
}

export interface BearerOptions {
	/**
	 * If true, only signed tokens
	 * will be converted to session
	 * cookies
	 *
	 * @default false
	 */
	requireSignature?: boolean | undefined;
	/**
	 * List of trusted origins that are allowed to receive tokens in redirect URLs.
	 * Token will only be appended to same-origin redirects or URLs matching these origins.
	 *
	 * WARNING: Tokens in URLs can be logged in browser history and server logs.
	 * Only specify trusted origins if you understand the security implications.
	 *
	 * Example: ['https://app.example.com', 'https://admin.example.com']
	 *
	 * @default []
	 */
	trustedRedirectOrigins?: string[] | undefined;
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
						} catch {
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
						const location = ctx.context.responseHeaders?.get("location");
						if (location) {
							try {
								const requestOrigin = ctx.request?.url
									? new URL(ctx.request.url).origin
									: null;
								const locationURL = requestOrigin
									? new URL(location, requestOrigin)
									: new URL(location);
									? new URL(ctx.request.url).origin
									: `${protocol}://${host}`;
								const locationURL = new URL(location, requestOrigin);

								// Only append token if redirect is to same origin or trusted origin
								const isSameOrigin = locationURL.origin === requestOrigin;
								const isTrustedOrigin =
									options?.trustedRedirectOrigins?.includes(locationURL.origin);

								if (isSameOrigin || isTrustedOrigin) {
									locationURL.searchParams.set("set-auth-token", token);
									ctx.setHeader("location", locationURL.toString());
								}
							} catch (_e) {
								// ignore invalid URL
							}
						}
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
		options,
	} satisfies BetterAuthPlugin;
};
