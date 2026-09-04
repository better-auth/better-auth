import type { BetterAuthCookie, BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { PACKAGE_VERSION } from "../version";
import {
	HOST_COOKIE_PREFIX,
	parseCookies,
	parseSetCookieHeader,
	SECURE_COOKIE_PREFIX,
	setRequestCookie,
	stripSecureCookiePrefix,
} from "./cookie-utils";
import { expireCookie } from "./index";

const toHostName = (legacyName: string) =>
	`${HOST_COOKIE_PREFIX}${legacyName.slice(SECURE_COOKIE_PREFIX.length)}`;

const hasLegacyCookie = (headers: Headers | undefined) =>
	!!headers?.get("cookie")?.includes(SECURE_COOKIE_PREFIX);

/**
 * Keeps existing sessions alive when `useHostCookiePrefix` is turned on.
 *
 * A legacy `__Secure-` cookie with no `__Host-` twin is mirrored under its
 * `__Host-` name for the duration of the request, so every read site sees
 * it. On the response, the core cookies are re-issued under the `__Host-`
 * name and the legacy copies are expired, so a session migrates on its
 * first request after the upgrade.
 */
export const secureCookieMigration = (): BetterAuthPlugin => ({
	id: "secure-cookie-migration",
	version: PACKAGE_VERSION,
	hooks: {
		before: [
			{
				matcher: (c) => hasLegacyCookie(c.request?.headers ?? c.headers),
				handler: createAuthMiddleware(async (c) => {
					const existing = (c.request?.headers ?? c.headers) as
						| Headers
						| undefined;
					const cookieHeader = existing?.get("cookie");
					if (!cookieHeader) return;
					const cookies = parseCookies(cookieHeader);
					const headers = new Headers(existing);
					let mirrored = false;
					for (const [name, value] of cookies) {
						if (!name.startsWith(SECURE_COOKIE_PREFIX)) continue;
						const hostName = toHostName(name);
						if (cookies.has(hostName)) continue;
						setRequestCookie(headers, hostName, value);
						mirrored = true;
					}
					if (!mirrored) return;
					return { context: { headers } };
				}),
			},
		],
		after: [
			{
				matcher: (c) => hasLegacyCookie(c.headers),
				handler: createAuthMiddleware(async (ctx) => {
					const cookies = parseCookies(ctx.headers?.get("cookie") ?? "");
					const alreadySet = parseSetCookieHeader(
						ctx.context.responseHeaders?.get("set-cookie") ?? "",
					);
					const authCookies = Object.values(
						ctx.context.authCookies,
					) as BetterAuthCookie[];
					const dontRemember = cookies.has(
						ctx.context.authCookies.dontRememberToken.name,
					);
					for (const [name, value] of cookies) {
						if (!name.startsWith(SECURE_COOKIE_PREFIX)) continue;
						const hostName = toHostName(name);
						// A real __Host- cookie with a different value is
						// authoritative; only a mirrored (or absent) twin migrates.
						const twin = cookies.get(hostName);
						if (twin !== undefined && twin !== value) continue;
						const base = stripSecureCookiePrefix(name);
						const cookie = authCookies.find((c) => {
							const coreBase = stripSecureCookiePrefix(c.name);
							return base === coreBase || base.startsWith(`${coreBase}.`);
						});
						if (!cookie) continue;
						if (!alreadySet.has(hostName)) {
							const isSessionToken =
								cookie.name === ctx.context.authCookies.sessionToken.name;
							ctx.setCookie(hostName, value, {
								...cookie.attributes,
								...(isSessionToken && dontRemember
									? { maxAge: undefined }
									: {}),
							});
						}
						expireCookie(ctx, { name, attributes: cookie.attributes });
					}
				}),
			},
		],
	},
});
