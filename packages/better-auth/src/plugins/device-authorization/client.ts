import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { DeviceAuthorizationPlugin } from ".";

export const deviceAuthorizationClient = () => {
	return {
		id: "device-authorization",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as DeviceAuthorizationPlugin,
		pathMethods: {
			"/device/code": "POST",
			"/device/token": "POST",
			"/device": "GET",
			"/device/approve": "POST",
			"/device/deny": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};

export type { DeviceAuthorizationPlugin } from ".";
