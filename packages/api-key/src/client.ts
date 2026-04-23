import type { BetterAuthClientPlugin } from "@better-auth/core";
import { API_KEY_ERROR_CODES } from "./error-codes.js";
import type { apiKey } from "./index.js";
import { PACKAGE_VERSION } from "./version.js";

export * from "./error-codes.js";

export const apiKeyClient = () => {
	return {
		id: "api-key",
		version: PACKAGE_VERSION,
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

export type * from "./types.js";
