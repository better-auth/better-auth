import type { BetterAuthClientPlugin } from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { GenericOAuthPlugin } from ".";
import { GENERIC_OAUTH_ERROR_CODES } from "./error-codes";

export const genericOAuthClient = () => {
	return {
		id: "generic-oauth-client",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as GenericOAuthPlugin,
		$ERROR_CODES: GENERIC_OAUTH_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type {
	BaseOAuthProviderOptions,
	GenericOAuthConfig,
	GenericOAuthOptions,
	GenericOAuthPlugin,
} from ".";
export * from "./error-codes";
export type * from "./providers";
