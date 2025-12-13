/// <reference types="electron" />

import type { BetterAuthClientPlugin, ClientStore } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import { isDevelopment } from "@better-auth/core/env";
import type { ErrorContext } from "@better-fetch/fetch";
import { requestAuth } from "./authenticate";
import {
	getCookie,
	getSetCookie,
	hasBetterAuthCookies,
	hasSessionCookieChanged,
} from "./cookies";
import { isElectronEnv, isProcessType } from "./helper";
import { registerProtocolScheme, setupCSP, setupIPCMain } from "./setup-main";
import type { ElectronClientOptions, Storage } from "./types";

const storageAdapter = async (storage: Storage) => {
	let safeStorage: Electron.SafeStorage | null = null;
	try {
		safeStorage = (await import("electron")).safeStorage;
	} catch {
		throw new Error(
			"Failed to import Electron's safeStorage module. Ensure this code is running in the main process.",
		);
	}

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
	const storage = storageAdapter(opts.storage);

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
						const { setEncrypted, getDecrypted } = await storage;

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
						let webContents: typeof Electron.WebContents | null = null;
						try {
							webContents = (await import("electron")).webContents;
						} catch {}
						if (!webContents) {
							return;
						}

						webContents
							.getFocusedWebContents()
							?.send(`${opts.namespace}:error`, {
								...context.error,
								path: context.request.url,
							});
					},
				},
				init: async (url, options) => {
					if (!isElectronEnv() || !isProcessType("browser")) {
						throw new Error(
							"Requests must be made from the Electron main process",
						);
					}

					const { setEncrypted, getDecrypted } = await storage;

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

			const getCookieFn = async () => {
				const { getDecrypted } = await storage;
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
				 * const cookie = await client.getCookie();
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
				 * import electron, { app, BrowserWindow } from "electron";
				 * import { resolve } from "node:path";
				 * import { client } from "./auth-client";
				 *
				 * let win: BrowserWindow | null = null;
				 *
				 * function createWindow() {
				 *   win = new BrowserWindow({
				 *     webPreferences: {
				 *       preload: path.join(__dirname, 'preload.mjs'),
				 *       nodeIntegration: true,
				 *     },
				 *   });
				 * }
				 *
				 * client.setupMain(electron, {
				 *   window: () => win,
				 *   resolve,
				 * });
				 *
				 * app.whenReady().then(createWindow);
				 * ```
				 */
				setupMain: (
					electron: {
						app: Electron.App;
						protocol: Electron.Protocol;
						session: typeof Electron.Session;
						ipcMain: Electron.IpcMain;
					},
					ctx: {
						/**
						 * Gets the main BrowserWindow instance.
						 */
						window: () => Electron.BrowserWindow | null | undefined;
						/**
						 * Resolves a given path relative to the main process file.
						 */
						resolve: (path: string) => string;
					},
				) => {
					if (!isProcessType("browser")) {
						throw new Error("`setupMain` is not running in the main process");
					}

					registerProtocolScheme(electron, $fetch, opts, ctx);
					setupCSP(electron, clientOptions);
					setupIPCMain(electron, opts, {
						$fetch,
						getCookie: getCookieFn,
					});
				},
				/**
				 * Sets up Electron IPC handlers for authentication.
				 *
				 * @example
				 * ```ts
				 * // preload.ts
				 * import electron from "electron";
				 * import { client } from "./auth-client";
				 *
				 * client.setupIPC(electron);
				 * ```
				 */
				setupIPC: (electron: {
					ipcMain?: Electron.IpcMain | undefined;
					ipcRenderer: Electron.IpcRenderer;
					contextBridge: Electron.ContextBridge;
				}) => {
					if (isProcessType("browser") && electron.ipcMain) {
						setupIPCMain({ ipcMain: electron.ipcMain }, opts, {
							$fetch,
							getCookie: getCookieFn,
						});
					} else if (isProcessType("renderer")) {
						const { contextBridge, ipcRenderer } = electron;

						contextBridge.exposeInMainWorld("requestAuth", () =>
							ipcRenderer.invoke(`${opts.namespace}:request-auth`),
						);
						contextBridge.exposeInMainWorld(
							"onAuthenticated",
							(callback: (user: User & Record<string, any>) => unknown) => {
								ipcRenderer.on(
									`${opts.namespace}:authenticated`,
									(_event, user) => callback(user),
								);
							},
						);
						contextBridge.exposeInMainWorld(
							"onAuthError",
							(callback: (context: ErrorContext) => unknown) => {
								ipcRenderer.on(`${opts.namespace}:error`, (_event, context) =>
									callback(context),
								);
							},
						);
						contextBridge.exposeInMainWorld("signOut", async () =>
							ipcRenderer.invoke(`${opts.namespace}:sign-out`),
						);
					}
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
							error: (context: ErrorContext & { path: string }) => unknown,
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
