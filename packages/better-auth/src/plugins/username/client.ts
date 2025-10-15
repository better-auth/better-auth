import type { username } from ".";
import type { BetterAuthClientPlugin } from "@better-auth/core";

export const usernameClient = () => {
	return {
		id: "username",
		$InferServerPlugin: {} as ReturnType<typeof username>,
	} satisfies BetterAuthClientPlugin;
};
