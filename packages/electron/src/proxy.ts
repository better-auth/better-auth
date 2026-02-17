import type { BetterAuthClientPlugin } from "@better-auth/core";
import { parseCookies } from "better-auth/cookies";
import type { electron } from "./index";
import type { ElectronProxyClientOptions } from "./types/client";
import { parseProtocolScheme } from "./utils";

export const electronProxyClient = (options: ElectronProxyClientOptions) => {
	const opts = {
		clientID: "electron",
		cookiePrefix: "better-auth",
		callbackPath: "/auth/callback",
		...options,
	};
	const redirectCookieName = `${opts.cookiePrefix}.${opts.clientID}`;
	const { scheme } = parseProtocolScheme(opts.protocol);

	return {
		id: "electron-proxy",
		getActions: () => {
			const getAuthorizationCode = () => {
				if (typeof document === "undefined") return null;

				const authorizationCode = parseCookies(document.cookie).get(
					redirectCookieName,
				);
				return authorizationCode ?? null;
			};

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
						const authorizationCode = getAuthorizationCode();
						if (!authorizationCode) {
							return false;
						}
						document.cookie = `${redirectCookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;

						window.location.replace(
							`${scheme}:/${opts.callbackPath}#token=${authorizationCode}`,
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
