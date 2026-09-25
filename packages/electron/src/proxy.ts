import type { BetterAuthClientPlugin, CookieSecurity } from "@better-auth/core";
import { parseCookies } from "better-auth/cookies";
import { getCookieKey } from "better-call";
import { getCookieSecurity } from "./cookies";
import type { electron } from "./index";
import type { ElectronProxyClientOptions } from "./types/client";
import { parseProtocolScheme } from "./utils";
import { PACKAGE_VERSION } from "./version";

export const electronProxyClient = (options: ElectronProxyClientOptions) => {
	if (
		options.cookieNamespace !== undefined &&
		options.cookiePrefix !== undefined
	) {
		throw new TypeError(
			"Use either cookieNamespace or cookiePrefix, not both.",
		);
	}
	const opts = {
		clientID: "electron",
		callbackPath: "/auth/callback",
		...options,
		cookieNamespace:
			options.cookieNamespace ?? options.cookiePrefix ?? "better-auth",
	};
	const redirectCookieName = `${opts.cookieNamespace}.${opts.clientID}`;
	const resolveRedirectCookieName = (security: CookieSecurity) =>
		getCookieKey(
			redirectCookieName,
			security === "none" ? undefined : security,
		) ?? redirectCookieName;
	const redirectCookieNames =
		opts.cookieSecurity !== undefined
			? [resolveRedirectCookieName(opts.cookieSecurity)]
			: [resolveRedirectCookieName("secure"), redirectCookieName];
	const { scheme } = parseProtocolScheme(opts.protocol);

	return {
		id: "electron-proxy",
		version: PACKAGE_VERSION,
		getActions: () => {
			const getAuthorizationCookie = () => {
				if (typeof document === "undefined") return null;

				const cookies = parseCookies(document.cookie);
				for (const name of redirectCookieNames) {
					const value = cookies.get(name);
					if (value) return { name, value };
				}
				return null;
			};
			const getAuthorizationCode = () =>
				getAuthorizationCookie()?.value ?? null;

			return {
				electron: {
					/**
					 * Gets the current authorization code from the cookie.
					 */
					getAuthorizationCode,
				},
				/**
				 * Ensures redirecting to the Electron app.
				 *
				 * Polls for a cookie set by the server to indicate that an authorization code is available.
				 *
				 * @returns The interval ID which can be used to clear the polling.
				 */
				ensureElectronRedirect: (
					cfg?:
						| {
								/**
								 * @default 10_000
								 */
								timeout?: number | undefined;
								/**
								 * @default 100
								 */
								interval?: number | undefined;
						  }
						| undefined,
				) => {
					const timeout = cfg?.timeout || 10_000;
					const interval = cfg?.interval || 100;

					const handleRedirect = () => {
						const authorizationCookie = getAuthorizationCookie();
						if (!authorizationCookie) {
							return false;
						}
						const secure =
							getCookieSecurity(authorizationCookie.name) === "none"
								? ""
								: "; Secure";
						document.cookie = `${authorizationCookie.name}=; Max-Age=0; Path=/${secure}`;

						window.location.replace(
							`${scheme}:/${opts.callbackPath}#token=${authorizationCookie.value}`,
						);
						return true;
					};

					const start = Date.now();
					const id = setInterval(() => {
						const success = handleRedirect();
						if (success || Date.now() - start > timeout) {
							clearInterval(id);
						}
					}, interval);

					return id;
				},
			};
		},
		pathMethods: {
			"/electron/transfer-user": "POST",
		},
		$InferServerPlugin: {} as ReturnType<typeof electron>,
	} satisfies BetterAuthClientPlugin;
};
