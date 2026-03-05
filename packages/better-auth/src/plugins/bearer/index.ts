import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { createHMAC } from "@better-auth/utils/hmac";
import { serializeSignedCookie } from "better-call";
import { parseSetCookieHeader } from "../../cookies";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
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
}

// RFC 7235: auth-scheme is case-insensitive
const BEARER_SCHEME = "bearer ";

function tryDecode(str: string): string {
	try {
		return decodeURIComponent(str);
	} catch {
		return str;
	}
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
						const authHeader =
							c.request?.headers.get("authorization") ||
							c.headers?.get("Authorization");
						if (!authHeader) {
							return;
						}
						if (
							authHeader.slice(0, BEARER_SCHEME.length).toLowerCase() !==
							BEARER_SCHEME
						) {
							return;
						}
						const token = authHeader.slice(BEARER_SCHEME.length).trim();
						if (!token) {
							return;
						}

						let signedToken: string;
						let decodedToken: string;

						if (token.includes(".")) {
							const isEncoded = token.includes("%");
							signedToken = isEncoded ? token : encodeURIComponent(token);
							decodedToken = isEncoded ? tryDecode(token) : token;
						} else {
							if (options?.requireSignature) {
								return;
							}
							signedToken = (
								await serializeSignedCookie("", token, c.context.secret)
							).replace("=", "");
							decodedToken = tryDecode(signedToken);
						}
						try {
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
						// Use headers.set() with "; " separator per RFC 6265.
						// headers.append("cookie") joins with ", " in some runtimes
						// (e.g. Deno, Cloudflare Workers), which breaks cookie parsing.
						const existingCookie = headers.get("cookie");
						const newCookie = `${c.context.authCookies.sessionToken.name}=${signedToken}`;
						headers.set(
							"cookie",
							existingCookie ? `${existingCookie}; ${newCookie}` : newCookie,
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
		options,
	} satisfies BetterAuthPlugin;
};
