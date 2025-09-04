import type { deviceAuthorization } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";

export const deviceAuthorizationClient = () => {
	return {
		id: "device-authorization",
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
