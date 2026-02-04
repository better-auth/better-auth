import type { BetterAuthClientOptions, ClientStore } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
import type { User } from "better-auth";
import electron from "electron";
import type { ElectronRequestAuthOptions } from "./authenticate";
import { requestAuth } from "./authenticate";
import type { ElectronClientOptions } from "./client";

const { ipcRenderer, ipcMain, contextBridge, webContents } = electron;

export function getChannelPrefixWithDelimiter(ns: string = "better-auth") {
	return ns.length > 0 ? ns + ":" : ns;
}

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

/**
 * Exposes IPC bridges to the renderer process.
 */
export function exposeBridges(opts: ElectronClientOptions) {
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

/**
 * Sets up IPC bridges in the main process.
 */
export function setupBridges(
	ctx: {
		$fetch: BetterFetch;
		$store: ClientStore | null;
		getCookie: () => string;
	},
	opts: ElectronClientOptions,
	clientOptions: BetterAuthClientOptions | undefined,
) {
	const prefix = getChannelPrefixWithDelimiter(opts.channelPrefix);

	ctx.$store?.atoms.session?.subscribe((state) => {
		if (state.isPending === true) return;

		webContents
			.getFocusedWebContents()
			?.send(`${prefix}user-updated`, state?.data?.user ?? null);
	});

	ipcMain.handle(`${prefix}getUser`, async () => {
		const result = await ctx.$fetch<{ user: User & Record<string, any> }>(
			"/get-session",
			{
				method: "GET",
				headers: {
					cookie: ctx.getCookie(),
					"content-type": "application/json",
				},
			},
		);

		return result.data?.user ?? null;
	});
	ipcMain.handle(
		`${prefix}requestAuth`,
		(_evt, options?: ElectronRequestAuthOptions | undefined) =>
			requestAuth(clientOptions, opts, options),
	);
	ipcMain.handle(`${prefix}signOut`, async () => {
		await ctx.$fetch("/sign-out", {
			method: "POST",
			body: "{}",
			headers: {
				cookie: ctx.getCookie(),
				"content-type": "application/json",
			},
		});
	});
}
