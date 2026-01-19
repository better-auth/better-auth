import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { genericOAuth } from ".";
import { GENERIC_OAUTH_ERROR_CODES } from "./error-codes";

export const genericOAuthClient = () => {
	return {
		id: "generic-oauth-client",
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
