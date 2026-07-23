import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { UsernamePlugin, UsernamePluginWithoutDisplayUsername } from ".";
import { USERNAME_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export type UsernameClientOptions = {
	/**
	 * Whether the server has the `displayUsername` field enabled.
	 *
	 * This must mirror the `displayUsername` option passed to the server
	 * `username` plugin so the client infers the correct user/session types.
	 *
	 * @default true
	 */
	displayUsername?: boolean | undefined;
};

export const usernameClient = <
	O extends UsernameClientOptions = UsernameClientOptions,
>(
	options?: O,
) => {
	return {
		id: "username",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as O["displayUsername"] extends false
			? UsernamePluginWithoutDisplayUsername
			: UsernamePlugin,
		atomListeners: [
			{
				matcher: (path) => path === "/sign-in/username",
				signal: "$sessionSignal",
			},
		],
		$ERROR_CODES: USERNAME_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};
