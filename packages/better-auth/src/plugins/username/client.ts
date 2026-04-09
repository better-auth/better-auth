import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { username } from ".";
import { USERNAME_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const usernameClient = () => {
	return {
		id: "username",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof username>,
		atomListeners: [
			{
				matcher: (path) => path === "/sign-in/username",
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: USERNAME_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};
