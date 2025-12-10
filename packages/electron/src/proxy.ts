import type { BetterAuthClientPlugin } from "@better-auth/core";
import { parseCookies } from "better-call";

export const electronProxyClient = (options: {
	protocol: {
		scheme: string;
	};
	/**
	 * The callback path to use for authentication redirects.
	 *
	 * @default "/auth/callback"
	 */
	callbackPath?: string;
	/**
	 * The name of the cookie used for redirecting after authentication.
	 *
	 * @default "redirect_client"
	 */
	redirectCookieName?: string | undefined;
	/**
	 * The prefix to use for cookies set by the plugin.
	 *
	 * @default "better-auth"
	 */
	cookiePrefix?: string | undefined;
}) => {
	const opts = {
		redirectCookieName: "redirect_client",
		cookiePrefix: "better-auth",
		...options,
	};
	const redirectCookieName = `${opts.cookiePrefix}.${opts.redirectCookieName}`;

	return {
		id: "electron-proxy",
		getActions: () => {
			return {
				ensureElectronRedirect: () => {
					if (typeof document === "undefined") {
						return false;
					}
					const redirectClient = parseCookies(document.cookie).get(
						redirectCookieName,
					);
					if (!redirectClient?.startsWith("electron:")) {
						return false;
					}
					document.cookie = `${redirectCookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
					window.location.href = `${opts.protocol.scheme}:/${opts.callbackPath}?token=${redirectClient.substring("electron:".length)}`;
					return true;
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};
