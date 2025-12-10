import type { BetterFetch } from "@better-fetch/fetch";
import type { ElectronClientOptions } from "./types";

export async function requestAuth(options: ElectronClientOptions) {
	let shell: Electron.Shell | null = null;
	try {
		shell = (await import("electron")).shell;
	} catch {
		throw new Error(
			"`requestAuth` can only be called in an Electron environment",
		);
	}

	await shell.openExternal(options.redirectURL, {
		activate: true,
	});
}

export async function authenticate(
	$fetch: BetterFetch,
	options: ElectronClientOptions,
	body: {
		token: string;
	},
	getWindow: () => Electron.BrowserWindow | null | undefined,
) {
	await $fetch("/electron/token", {
		method: "POST",
		body,
		onSuccess: (ctx) => {
			getWindow()?.webContents.send(
				`${options.namespace || "auth"}:authenticated`,
				ctx.data.user,
			);
		},
		onError: (ctx) => {
			// TODO: Handle errors gracefully
		},
	});
}
