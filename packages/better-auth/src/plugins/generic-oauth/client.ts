import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { genericOAuth } from ".";

export const genericOAuthClient = () => {
	return {
		id: "generic-oauth-client",
		$InferServerPlugin: {} as ReturnType<typeof genericOAuth>,
	} satisfies BetterAuthClientPlugin;
};

export type {
	BaseOAuthProviderOptions,
	GenericOAuthConfig,
	GenericOAuthOptions,
} from "./index";
export type * from "./providers";
