import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { apiKey } from ".";
import { API_KEY_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

export const apiKeyClient = () => {
	return {
		id: "api-key",
		$InferServerPlugin: {} as ReturnType<typeof apiKey>,
		pathMethods: {
			"/api-key/create": "POST",
			"/api-key/delete": "POST",
			"/api-key/delete-all-expired-api-keys": "POST",
		},
		$ERROR_CODES: API_KEY_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export type ApiKeyClientPlugin = ReturnType<typeof apiKeyClient>;

export type * from "./types";
