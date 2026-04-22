import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { deviceAuthorization } from ".";

export const deviceAuthorizationClient = () => {
	return {
		id: "device-authorization",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof deviceAuthorization>,
		pathMethods: {
			"/device/code": "POST",
			"/device/token": "POST",
			"/device": "GET",
			"/device/approve": "POST",
			"/device/deny": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
