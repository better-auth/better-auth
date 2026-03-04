import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { DefaultApiKeyPlugin } from ".";
import { API_KEY_ERROR_CODES } from "./error-codes";

export * from "./error-codes";

interface ApiKeyClientOptions {
	schema?:
		| {
				apikey?: {
					additionalFields?: {
						[key: string]: DBFieldAttribute;
					};
				};
		  }
		| undefined;
}

export const apiKeyClient = <CO extends ApiKeyClientOptions>(
	_options?: CO | undefined,
) => {
	return {
		id: "api-key",
		$InferServerPlugin: {} as DefaultApiKeyPlugin<{
			schema: CO["schema"];
		}>,
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
