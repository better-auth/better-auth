import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { dbsc } from ".";
import { PACKAGE_VERSION } from "./version";

/**
 * Adds the device-bound session field to the client's session type. The
 * browser handles registration and refresh itself, so there are no actions.
 */
export const dbscClient = () =>
	({
		id: "dbsc",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof dbsc>,
	}) satisfies BetterAuthClientPlugin;
