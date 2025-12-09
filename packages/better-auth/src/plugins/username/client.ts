import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { username } from ".";

export const usernameClient = () => {
	return {
		id: "username",
		$InferServerPlugin: {} as ReturnType<typeof username>,
		atomListeners: [
			{
				matcher: (path) => path === "/sign-in/username",
				signal: "$sessionSignal",
			},
		],
	} satisfies BetterAuthClientPlugin;
};
