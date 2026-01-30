import electron from "electron";
import type { SetupMainConfig } from "./setup";
import type { ElectronClientOptions } from "./types/client";

const { BrowserWindow } = electron;

export function getWindowFn(
	cfg:
		| {
				getWindow?: SetupMainConfig["getWindow"] | undefined;
		  }
		| undefined,
) {
	return (
		cfg?.getWindow ??
		(() => {
			const allWindows = BrowserWindow.getAllWindows();
			return allWindows.length > 0 ? allWindows[0] : null;
		})
	);
}

export function isProcessType(type: typeof process.type) {
	return typeof process !== "undefined" && process.type === type;
}

export function parseProtocolScheme(
	protocolOption: ElectronClientOptions["protocol"],
) {
	if (typeof protocolOption === "string") {
		return {
			scheme: protocolOption,
			privileges: {},
		};
	}

	return {
		scheme: protocolOption.scheme,
		privileges: protocolOption.privileges || {},
	};
}
