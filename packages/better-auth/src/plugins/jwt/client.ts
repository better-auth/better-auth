import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { JSONWebKeySet } from "jose";
import type { jwt } from "./index";

interface JwtClientOptions {
	jwks?: {
		/**
		 * The path of the endpoint exposing the JWKS.
		 * Must match the server configuration.
		 *
		 * @default /jwks
		 */
		jwksPath?: string;
	};
}

export const jwtClient = (options?: JwtClientOptions) => {
	const jwksPath = options?.jwks?.jwksPath ?? "/jwks";

	return {
		id: "better-auth-client",
		$InferServerPlugin: {} as ReturnType<typeof jwt>,
		pathMethods: {
			[jwksPath]: "GET",
		},
		getActions: ($fetch) => ({
			jwks: async (fetchOptions?: any) => {
				return await $fetch<JSONWebKeySet>(jwksPath, {
					method: "GET",
					...fetchOptions,
				});
			},
		}),
	} satisfies BetterAuthClientPlugin;
};

export type * from "./types";
