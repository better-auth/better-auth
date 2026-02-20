import type { Awaitable } from "@better-auth/core";
import type { User } from "@better-auth/core/db";
import { BetterAuthError } from "@better-auth/core/error";
import type { BetterFetchError } from "@better-fetch/fetch";
import electron, { contextBridge } from "electron";
import type { ElectronRequestAuthOptions } from "./authenticate";
import type { ElectronClientOptions } from "./types/client";
import { getChannelPrefixWithDelimiter, isProcessType } from "./utils";

const { ipcRenderer } = electron;

function listenerFactory(
	channel: string,
	listener: (
		event: Electron.IpcRendererEvent,
		...args: any[]
	) => void | Promise<void>,
) {
	ipcRenderer.on(channel, listener);
	return () => {
		ipcRenderer.off(channel, listener);
	};
}

export type ExposedBridges<O extends ElectronClientOptions> = ReturnType<
	typeof exposeBridges<O>
>["$InferBridges"];

/**
 * Exposes IPC bridges to the renderer process.
 */
function exposeBridges<O extends ElectronClientOptions>(
	opts: SetupRendererConfig<O>,
) {
	if (!process.contextIsolated) {
		throw new BetterAuthError(
			"Context isolation must be enabled to use IPC bridges securely.",
		);
	}

	type SanitizedUser = O["sanitizeUser"] extends (
		user: User & Record<string, any>,
	) => Awaitable<User & Record<string, any>>
		? Awaited<ReturnType<O["sanitizeUser"]>>
		: User & Record<string, any>;

	const prefix = getChannelPrefixWithDelimiter(opts.channelPrefix);
	const bridges = {
		getUser: async () => {
			return (await ipcRenderer.invoke(
				`${prefix}getUser`,
			)) as SanitizedUser | null;
		},
		requestAuth: async (options?: ElectronRequestAuthOptions) => {
			await ipcRenderer.invoke(`${prefix}requestAuth`, options);
		},
		signOut: async () => {
			await ipcRenderer.invoke(`${prefix}signOut`);
		},
		authenticate: async (data: { token: string }) => {
			await ipcRenderer.invoke(`${prefix}authenticate`, data);
		},
		onAuthenticated: (callback: (user: SanitizedUser) => unknown) => {
			const channel = `${prefix}authenticated`;
			return listenerFactory(channel, async (_evt, user) => {
				await callback(user);
			});
		},
		onUserUpdated: (callback: (user: SanitizedUser | null) => unknown) => {
			const channel = `${prefix}user-updated`;
			return listenerFactory(channel, async (_evt, user) => {
				await callback(user);
			});
		},
		onAuthError: (
			callback: (context: BetterFetchError & { path: string }) => unknown,
		) => {
			const channel = `${prefix}error`;
			return listenerFactory(channel, async (_evt, context) => {
				await callback(context);
			});
		},
	};

	for (const [key, value] of Object.entries(bridges)) {
		contextBridge.exposeInMainWorld(key, value);
	}

	return {} as {
		$InferBridges: typeof bridges;
	};
}

export interface SetupRendererConfig<
	O extends ElectronClientOptions = ElectronClientOptions,
> {
	channelPrefix?: O["channelPrefix"] | undefined;
}

/**
 * Sets up the renderer process.
 *
 * - Exposes IPC bridges to the renderer process.
 */
export function setupRenderer(options: SetupRendererConfig = {}) {
	if (!isProcessType("renderer")) {
		throw new BetterAuthError(
			"setupRenderer can only be called in the renderer process.",
		);
	}
	void exposeBridges(options);
}
