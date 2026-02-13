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

export type ExposedBridges = ReturnType<typeof exposeBridges>["$InferBridges"];

/**
 * Exposes IPC bridges to the renderer process.
 */
function exposeBridges(opts: SetupRendererConfig) {
	if (!process.contextIsolated) {
		throw new BetterAuthError(
			"Context isolation must be enabled to use IPC bridges securely.",
		);
	}

	const prefix = getChannelPrefixWithDelimiter(opts.channelPrefix);
	const bridges = {
		getUser: async () => {
			return (await ipcRenderer.invoke(`${prefix}getUser`)) as User &
				Record<string, any>;
		},
		requestAuth: async (options?: ElectronRequestAuthOptions) => {
			await ipcRenderer.invoke(`${prefix}requestAuth`, options);
		},
		signOut: async () => {
			await ipcRenderer.invoke(`${prefix}signOut`);
		},
		onAuthenticated: (
			callback: (user: User & Record<string, any>) => unknown,
		) => {
			const channel = `${prefix}authenticated`;
			return listenerFactory(channel, async (_evt, user) => {
				await callback(user);
			});
		},
		onUserUpdated: (
			callback: (user: (User & Record<string, any>) | null) => unknown,
		) => {
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

export interface SetupRendererConfig {
	channelPrefix?: ElectronClientOptions["channelPrefix"] | undefined;
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
