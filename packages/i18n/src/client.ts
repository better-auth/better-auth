import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { I18nPlugin } from ".";
import { PACKAGE_VERSION } from "./version";

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
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as I18nPlugin,
	} satisfies BetterAuthClientPlugin;
};

export type { I18nPlugin } from ".";
