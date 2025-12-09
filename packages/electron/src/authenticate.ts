import type { BetterFetch } from "@better-fetch/fetch";
import type { ElectronClientOptions } from "./types";

export async function requestAuth(options: ElectronClientOptions) {
	let shell: Electron.Shell | null = null;
	try {
		shell = (await import("electron/common")).shell;
	} catch {
		throw new Error(
			"`requestAuth` can only be called in an Electron environment",
		);
	}

  void shell.openExternal(options.redirectURL, {
		activate: true,
	});
}

export async function authenticate(
	$fetch: BetterFetch,
	options: ElectronClientOptions,
	body: {
		code: string;
	},
	getWindow: () => Electron.BrowserWindow | null | undefined,
) {
	await $fetch("/electron/token", {
		method: "POST",
		body,
		onSuccess: (ctx) => {
      getWindow()?.webContents.send(`${options.namespace || "auth"}:authenticated`, ctx.data);
		},
		onError: (ctx) => {
  		// TODO: Handle errors gracefully
		}
	});
}
