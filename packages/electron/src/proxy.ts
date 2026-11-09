import type { BetterAuthClientPlugin } from "@better-auth/core";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { parseCookies } from "better-auth/cookies";
import type { electron } from "./index";
import type { ElectronProxyClientOptions } from "./types/client";
import { parseProtocolScheme } from "./utils";
import { PACKAGE_VERSION } from "./version";

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

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
		version: PACKAGE_VERSION,
		getActions: () => {
			const getAuthorizationCode = () => {
				if (typeof document === "undefined") return null;

				const authorizationCode = parseCookies(document.cookie).get(
					redirectCookieName,
				);
				// The decoder throws outside the base64url alphabet.
				if (!authorizationCode || !BASE64URL.test(authorizationCode)) {
					return null;
				}
				const payload = safeJSONParse<{
					identifier?: unknown;
					state?: unknown;
				}>(new TextDecoder().decode(base64Url.decode(authorizationCode)));
				if (typeof payload?.identifier !== "string" || !payload.identifier) {
					return null;
				}
				if (typeof payload.state !== "string" || !payload.state) {
					return null;
				}
				if (typeof window === "undefined") return authorizationCode;

				const query = new URLSearchParams(window.location.search);
				const state = query.get("state");
				if (
					query.get("client_id") === opts.clientID &&
					state &&
					payload.state !== state
				) {
					return null;
				}
				return authorizationCode;
			};

			return {
				electron: {
					/**
					 * Gets the current authorization code from the cookie.
					 * When the page has Electron request parameters, ignores codes for another state.
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
