import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { username } from ".";

export const usernameClient = () => {
	return {
		id: "username",
		$InferServerPlugin: {} as ReturnType<typeof username>,
	} satisfies BetterAuthClientPlugin;
};
