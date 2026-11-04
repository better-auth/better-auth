import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { pin } from ".";
import { PIN_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const pinClient = () => {
	return {
		id: "pin",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof pin>,
		pathMethods: {
			"/pin/set": "POST",
			"/pin/change": "POST",
			"/pin/verify": "POST",
			"/pin/disable": "POST",
			"/pin/status": "GET",
		},
		atomListeners: [
			{
				matcher(path) {
					return (
						path === "/pin/verify" ||
						path === "/pin/disable" ||
						path === "/pin/set"
					);
				},
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: PIN_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type * from "./types";
