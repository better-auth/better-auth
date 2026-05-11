import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { genericOAuth } from ".";
import { GENERIC_OAUTH_ERROR_CODES } from "./error-codes";

/**
 * @deprecated No longer needed. Generic OAuth providers now use the standard
 * `signIn.social` flow and require no client plugin. Remove this from your
 * client plugin list.
 */
export const genericOAuthClient = () => {
	return {
		id: "generic-oauth-client",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof genericOAuth>,
		$ERROR_CODES: GENERIC_OAUTH_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export * from "./error-codes";
export type {
	BaseOAuthProviderOptions,
	GenericOAuthConfig,
	GenericOAuthOptions,
} from "./index";
export type * from "./providers";
