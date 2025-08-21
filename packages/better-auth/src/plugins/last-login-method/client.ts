import { lastSocialProvider } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const lastSocialProviderClient = () => {
	return {
		id: "last-login-method",
		$InferServerPlugin: {} as ReturnType<typeof lastSocialProvider>,
	} satisfies BetterAuthClientPlugin;
};
