import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { DeviceAuthorizationGrant, deviceAuthorization } from ".";

export const deviceAuthorizationClient = <
	Grant extends DeviceAuthorizationGrant | undefined = undefined,
>() => {
	return {
		id: "device-authorization",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof deviceAuthorization<Grant>>,
		pathMethods: {
			"/device/code": "POST",
			"/device/token": "POST",
			"/device": "GET",
			"/device/approve": "POST",
			"/device/deny": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
