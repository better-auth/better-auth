/// <reference types="electron" />

import type { BetterAuthClientPlugin, ClientStore } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import { isDevelopment } from "@better-auth/core/env";
import type { BetterFetchError } from "@better-fetch/fetch";
import { contextBridge, ipcRenderer, safeStorage, webContents } from "electron";
import { isProcessType, requestAuth } from "./authenticate";
import {
	getCookie,
	getSetCookie,
	hasBetterAuthCookies,
	hasSessionCookieChanged,
} from "./cookies";
import { registerProtocolScheme, setupCSP, setupIPCMain } from "./setup-main";
import type { ElectronClientOptions, Storage } from "./types";

const storageAdapter = (storage: Storage) => {
	return {
		...storage,
		getDecrypted: (name: string) => {
			const item = storage.get(name);
			if (!item) {
				return null;
			}
			return safeStorage.decryptString(Buffer.from(item));
		},
		setEncrypted: (name: string, value: string) => {
			const encrypted = safeStorage.encryptString(value);
			return storage.set(name, encrypted);
		},
	};
};

/**
 * Sets up Electron IPC handlers for authentication.
 *
 * @example
 * ```ts
 * // preload.ts
 * import { setupIPC } from "@better-auth/electron/client";
 *
 * setupIPC();
 * ```
 */
export const setupIPC = (opts: { namespace?: string | undefined } = {}) => {
	opts.namespace ??= "better-auth";
	contextBridge.exposeInMainWorld("requestAuth", () =>
		ipcRenderer.invoke(`${opts.namespace}:request-auth`),
	);
	contextBridge.exposeInMainWorld(
		"onAuthenticated",
		(callback: (user: User & Record<string, any>) => unknown) => {
			ipcRenderer.on(`${opts.namespace}:authenticated`, (_event, user) =>
				callback(user),
			);
		},
	);
	contextBridge.exposeInMainWorld(
		"onAuthError",
		(callback: (context: BetterFetchError & { path: string }) => unknown) => {
			ipcRenderer.on(`${opts.namespace}:error`, (_event, context) =>
				callback(context),
			);
		},
	);
	contextBridge.exposeInMainWorld("signOut", async () =>
		ipcRenderer.invoke(`${opts.namespace}:sign-out`),
	);
};

export const electronClient = (options: ElectronClientOptions) => {
	const opts = {
		storagePrefix: "better-auth",
		cookiePrefix: "better-auth",
		namespace: "better-auth",
		callbackPath: "/auth/callback",
		...options,
	};

	const { scheme } =
		typeof opts.protocol === "string"
			? { scheme: opts.protocol }
			: opts.protocol;

	let store: ClientStore | null = null;
	const cookieName = `${opts.storagePrefix}_cookie`;
	const localCacheName = `${opts.storagePrefix}_session_data`;
	const { getDecrypted, setEncrypted } = storageAdapter(opts.storage);

	if (
		isDevelopment() &&
		// At least 1 dot, no leading or trailing dot, no consecutive dots
		/^(?!\.)(?!.*\.\.)(?!.*\.$)[^.]+\.[^.]+$/.test(scheme)
	) {
		console.warn(
			"The provided scheme does not follow the reverse domain name notation. For example: `app.example.com` -> `com.example.app`.",
		);
	}

	return {
		id: "electron",
		fetchPlugins: [
			{
				id: "electron",
				name: "Electron",
				hooks: {
					onSuccess: async (context) => {
						const setCookie = context.response.headers.get("set-cookie");

						if (setCookie) {
							if (hasBetterAuthCookies(setCookie, opts.cookiePrefix)) {
								const prevCookie = getDecrypted(cookieName);
								const toSetCookie = getSetCookie(
									setCookie || "{}",
									prevCookie ?? undefined,
								);

								if (hasSessionCookieChanged(prevCookie, toSetCookie)) {
									setEncrypted(cookieName, toSetCookie);
									store?.notify("$sessionSignal");
								} else {
									setEncrypted(cookieName, toSetCookie);
								}
							}
						}

						if (
							context.request.url.toString().includes("/get-session") &&
							!opts.disableCache
						) {
							const data = context.data;
							setEncrypted(localCacheName, JSON.stringify(data));
						}
					},
					onError: async (context) => {
						webContents
							.getFocusedWebContents()
							?.send(`${opts.namespace}:error`, {
								...context.error,
								path: context.request.url,
							});
					},
				},
				init: async (url, options) => {
					if (!isProcessType("browser")) {
						throw new Error(
							"Requests must be made from the Electron main process",
						);
					}

					const storedCookie = getDecrypted(cookieName);
					const cookie = getCookie(storedCookie || "{}");
					options ||= {};
					options.credentials = "omit";
					options.headers = {
						...options.headers,
						cookie,
						"electron-origin": `${scheme}:/`,
						"x-skip-oauth-proxy": "true",
					};

					if (url.includes("/sign-out")) {
						setEncrypted(cookieName, "{}");
						store?.atoms.session?.set({
							...store.atoms.session.get(),
							data: null,
							error: null,
							isPending: false,
						});
						setEncrypted(localCacheName, "{}");
					}

					return {
						url,
						options,
					};
				},
			},
		],
		getActions: ($fetch, $store, clientOptions) => {
			store = $store;

			const getCookieFn = () => {
				const cookie = getDecrypted(cookieName);
				return getCookie(cookie || "{}");
			};

			return {
				/**
				 * Gets the stored cookie.
				 *
				 * You can use this to get the cookie stored in
				 * the device and use it in your fetch requests.
				 *
				 * @example
				 * ```ts
				 * const cookie = client.getCookie();
				 * await fetch("https://api.example.com", {
				 *   headers: {
				 *    cookie,
				 *   },
				 * });
				 * ```
				 */
				getCookie: getCookieFn,
				/**
				 * Initiates the authentication process.
				 * Opens the system's default browser for user authentication.
				 */
				requestAuth: () => requestAuth(opts),
				/**
				 * Sets up the Electron main process for authentication.
				 *
				 * - Registers a custom protocol scheme.
				 * - Sets up Content Security Policy (CSP) headers.
				 * - Configures IPC handlers for communication between the main and renderer processes.
				 *
				 * @example
				 * ```ts
				 * // main.ts
				 * import { app, BrowserWindow } from "electron";
				 * import { join, resolve } from "node:path";
				 * import { client } from "./auth-client";
				 *
				 * let win: BrowserWindow | null = null;
				 *
				 * function createWindow() {
				 *   win = new BrowserWindow({
				 *     webPreferences: {
				 *       preload: join(__dirname, 'preload.mjs'),
				 *       contextIsolation: true,
				 *     },
				 *   });
				 * }
				 *
				 * client.setupMain({
				 *   window: () => win,
				 *   resolve,
				 * });
				 *
				 * app.whenReady().then(createWindow);
				 * ```
				 */
				setupMain: (ctx: {
					/**
					 * Gets the main BrowserWindow instance.
					 */
					window: () => Electron.BrowserWindow | null | undefined;
					/**
					 * Resolves a given path relative to the main process file.
					 */
					resolve: (path: string) => string;
				}) => {
					if (!isProcessType("browser")) {
						throw new Error("`setupMain` is not running in the main process");
					}

					registerProtocolScheme($fetch, opts, ctx);
					setupCSP(clientOptions);
					setupIPCMain(opts, {
						$fetch,
						getCookie: getCookieFn,
					});
				},
				$Infer: {} as {
					Window: {
						/**
						 * Initiates the authentication process.
						 * Opens the system's default browser for user authentication.
						 */
						requestAuth: () => Promise<void>;
						/**
						 * Registers a callback to be invoked when the user is authenticated.
						 *
						 * @param callback - The callback function to be invoked with the authenticated user data.
						 */
						onAuthenticated: (
							callback: (user: User & Record<string, any>) => unknown,
						) => void;
						/**
						 * Registers a callback to be invoked when an error occurs.
						 *
						 * @param callback - The callback function to be invoked with the error context.
						 */
						onAuthError: (
							error: (context: BetterFetchError & { path: string }) => unknown,
						) => void;
						/**
						 * Signs out the current user.
						 */
						signOut: () => Promise<void>;
					};
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};

export * from "./types";
