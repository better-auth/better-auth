import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { i18n } from ".";

/**
 * i18n client plugin for Better Auth
 *
 * This client plugin provides type inference for the i18n server plugin.
 * Error messages from the server will already be translated based on
 * the detected locale.
 *
 * @example
 * ```ts
 * import { createAuthClient } from "better-auth/client";
 * import { i18nClient } from "@better-auth/i18n/client";
 *
 * export const client = createAuthClient({
 *   plugins: [i18nClient()],
 * });
 * ```
 */
export const i18nClient = () => {
	return {
		id: "i18n",
		$InferServerPlugin: {} as ReturnType<typeof i18n>,
	} satisfies BetterAuthClientPlugin;
};
