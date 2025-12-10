/// <reference types="electron" />

import type { BetterAuthClientPlugin, ClientStore } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import { isDevelopment } from "@better-auth/core/env";
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
		namespace: "auth",
		callbackPath: "/auth/callback",
		...options,
	};

	let store: ClientStore | null = null;
	const cookieName = `${opts.storagePrefix}_cookie`;
	const localCacheName = `${opts.storagePrefix}_session_data`;
	const storage = storageAdapter(opts.storage);

	if (
		isDevelopment() &&
		// At least 1 dot, no leading or trailing dot, no consecutive dots
		/^(?!\.)(?!.*\.\.)(?!.*\.$)[^.]+\.[^.]+$/.test(opts.protocol.scheme)
	) {
		console.warn(
			"The provided scheme does not follow the reverse domain name notation. For example, `app.example.com` becomes `com.example.app`.",
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
				},
				init: async (url, options) => {
					const { setEncrypted, getDecrypted } = await storage;

					const storedCookie = getDecrypted(cookieName);
					const cookie = getCookie(storedCookie || "{}");
					options ||= {};
					options.credentials = "omit";
					options.headers = {
						...options.headers,
						cookie,
						"electron-origin": `${opts.protocol.scheme}:/`,
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
			if (isElectronEnv()) {
				store = $store;
			}

			return {
				getCookie: async () => {
					const { getDecrypted } = await storage;
					const cookie = getDecrypted(cookieName);
					return getCookie(cookie || "{}");
				},
				requestAuth: () => requestAuth(opts),
				/**
				 * Sets up the Electron main process for authentication.
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
						 *
						 * @example
						 * ```ts
						 * import * as electron from "electron";
						 * import { resolve } from "node:path";
						 *
						 * let win: Electron.BrowserWindow | null = null;
						 *
						 * authClient.setupMain(electron, {
						 *   window: () => win,
						 *   resolve,
						 * });
						 *
						 * app.whenReady().then(() => {
						 *   win = createWindow();
						 * });
						 * ```
						 */
						window: () => Electron.BrowserWindow | null | undefined;
						/**
						 * Resolves a given path relative to the main process file.
						 *
						 * @example
						 * ```ts
						 * import * as electron from "electron";
						 * import { resolve } from "node:path";
						 *
						 * let win: Electron.BrowserWindow | null = null;
						 *
						 * authClient.setupMain(electron, {
						 *   resolve,
						 *   window: () => win,
						 * });
						 *
						 * app.whenReady().then(() => {
						 *   win = createWindow();
						 * });
						 * ```
						 */
						resolve: (path: string) => string;
					},
				) => {
					if (!isProcessType("browser")) {
						throw new Error("`setupMain` is not running in the main process");
					}

					registerProtocolScheme(electron, $fetch, opts, ctx);
					setupCSP(electron, clientOptions);
					setupIPCMain(electron, opts);
				},
				/**
				 * Sets up Electron IPC handlers for authentication.
				 */
				setupIPC: (electron: {
					ipcMain?: Electron.IpcMain | undefined;
					ipcRenderer: Electron.IpcRenderer;
					contextBridge: Electron.ContextBridge;
				}) => {
					if (isProcessType("browser") && electron.ipcMain) {
						setupIPCMain({ ipcMain: electron.ipcMain }, opts);
					} else if (isProcessType("renderer")) {
						const { contextBridge, ipcRenderer } = electron;

						contextBridge.exposeInMainWorld("requestAuth", () =>
							ipcRenderer.invoke(`${opts.namespace}:request-auth`),
						);
						contextBridge.exposeInMainWorld(
							"onAuthenticated",
							(
								callback: (user: User & Record<string, any>) => unknown,
							) => {
								ipcRenderer.on(
									`${opts.namespace}:authenticated`,
									(_event, user) => callback(user),
								);
							},
						);
					}
				},
				$Infer: {} as {
					Window: {
						requestAuth: () => Promise<void>;
						onAuthenticated: (
							callback: (user: User & Record<string, any>) => unknown,
						) => void;
					};
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};

export * from "./types";
