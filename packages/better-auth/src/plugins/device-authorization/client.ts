import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { DeviceAuthorizationGrant, deviceAuthorization } from ".";
import { DEVICE_AUTHORIZATION_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const deviceAuthorizationClient = <
	Grant extends DeviceAuthorizationGrant | undefined = undefined,
>() => {
	return {
		id: "device-authorization",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof deviceAuthorization<Grant>>,
		$ERROR_CODES: DEVICE_AUTHORIZATION_ERROR_CODES,
		pathMethods: {
			"/device/code": "POST",
			"/device/token": "POST",
			"/device": "GET",
			"/device/approve": "POST",
			"/device/deny": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
