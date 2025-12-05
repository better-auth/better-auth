import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { apiKey } from ".";

export const apiKeyClient = () => {
	return {
		id: "api-key",
		$InferServerPlugin: {} as ReturnType<typeof apiKey>,
		pathMethods: {
			"/api-key/create": "POST",
			"/api-key/delete": "POST",
			"/api-key/delete-all-expired-api-keys": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};

export type ApiKeyClientPlugin = ReturnType<typeof apiKeyClient>;

export type * from "./types";
