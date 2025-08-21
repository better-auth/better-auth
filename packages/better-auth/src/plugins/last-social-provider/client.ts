import { lastSocialProvider } from ".";
import type { BetterAuthClientPlugin } from "../../types";

export const lastSocialProviderClient = () => {
	return {
		id: "last-social-provider",
		$InferServerPlugin: {} as ReturnType<typeof lastSocialProvider>,
	} satisfies BetterAuthClientPlugin;
};
