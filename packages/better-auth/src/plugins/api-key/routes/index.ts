import type { AuthContext } from "@better-auth/core";
import { API_KEY_TABLE_NAME } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey, ApiKeyOptions } from "../types";
import { createApiKey } from "./create-api-key";
import { deleteAllExpiredApiKeysEndpoint } from "./delete-all-expired-api-keys";
import { deleteApiKey } from "./delete-api-key";
import { getApiKey } from "./get-api-key";
import { listApiKeys } from "./list-api-keys";
import { updateApiKey } from "./update-api-key";
import { verifyApiKey } from "./verify-api-key";

export type PredefinedApiKeyOptions = ApiKeyOptions &
	Required<
		Pick<
			ApiKeyOptions,
			| "apiKeyHeaders"
			| "defaultKeyLength"
			| "keyExpiration"
			| "rateLimit"
			| "maximumPrefixLength"
			| "minimumPrefixLength"
			| "maximumNameLength"
			| "disableKeyHashing"
			| "minimumNameLength"
			| "requireName"
			| "enableMetadata"
			| "enableSessionForAPIKeys"
			| "startingCharactersConfig"
			| "storage"
			| "fallbackToDatabase"
		>
	> & {
		keyExpiration: Required<ApiKeyOptions["keyExpiration"]>;
		startingCharactersConfig: Required<
			ApiKeyOptions["startingCharactersConfig"]
		>;
	};

let lastChecked: Date | null = null;

export async function deleteAllExpiredApiKeys(
	ctx: AuthContext,
	byPassLastCheckTime = false,
): Promise<void> {
	if (lastChecked && !byPassLastCheckTime) {
		const now = new Date();
		const diff = now.getTime() - lastChecked.getTime();
		if (diff < 10000) {
			return;
		}
	}
	lastChecked = new Date();
	await ctx.adapter
		.deleteMany({
			model: API_KEY_TABLE_NAME,
			where: [
				{
					field: "expiresAt" satisfies keyof ApiKey,
					operator: "lt",
					value: new Date(),
				},
				{
					field: "expiresAt",
					operator: "ne",
					value: null,
				},
			],
		})
		.catch((error) => {
			ctx.logger.error(`Failed to delete expired API keys:`, error);
		});
}

export function createApiKeyRoutes({
	keyGenerator,
	opts,
	schema,
}: {
	keyGenerator: (options: {
		length: number;
		prefix: string | undefined;
	}) => Promise<string> | string;
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
}) {
	return {
		createApiKey: createApiKey({
			keyGenerator,
			opts,
			schema,
			deleteAllExpiredApiKeys,
		}),
		verifyApiKey: verifyApiKey({ opts, schema, deleteAllExpiredApiKeys }),
		getApiKey: getApiKey({ opts, schema, deleteAllExpiredApiKeys }),
		updateApiKey: updateApiKey({ opts, schema, deleteAllExpiredApiKeys }),
		deleteApiKey: deleteApiKey({ opts, schema, deleteAllExpiredApiKeys }),
		listApiKeys: listApiKeys({ opts, schema, deleteAllExpiredApiKeys }),
		deleteAllExpiredApiKeys: deleteAllExpiredApiKeysEndpoint({
			deleteAllExpiredApiKeys,
		}),
	};
}
