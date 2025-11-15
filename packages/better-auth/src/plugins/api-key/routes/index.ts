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

export type PredefinedApiKeyOptions<O extends ApiKeyOptions = ApiKeyOptions> =
	O &
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
			>
		> & {
			keyExpiration: Required<NonNullable<ApiKeyOptions["keyExpiration"]>>;
			startingCharactersConfig: Required<
				NonNullable<ApiKeyOptions["startingCharactersConfig"]>
			>;
			rateLimit: Required<NonNullable<ApiKeyOptions["rateLimit"]>>;
		};

export interface RouteContext<O extends ApiKeyOptions> {
	keyGenerator: (options: {
		length: number;
		prefix: string | undefined;
	}) => Promise<string> | string;
	opts: PredefinedApiKeyOptions<O>;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys?: (
		ctx: AuthContext,
		byPassLastCheckTime?: boolean | undefined,
	) => void;
}

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

export function createApiKeyRoutes<O extends ApiKeyOptions>({
	keyGenerator,
	opts,
	schema,
}: {
	keyGenerator: (options: {
		length: number;
		prefix: string | undefined;
	}) => Promise<string> | string;
	opts: PredefinedApiKeyOptions<O>;
	schema: ReturnType<typeof apiKeySchema>;
}) {
	return {
		createApiKey: createApiKey<O>({
			keyGenerator,
			opts,
			schema,
			deleteAllExpiredApiKeys,
		}),
		verifyApiKey: verifyApiKey<O>({ opts, schema, deleteAllExpiredApiKeys }),
		getApiKey: getApiKey<O>({ opts, schema, deleteAllExpiredApiKeys }),
		updateApiKey: updateApiKey<O>({ opts, schema, deleteAllExpiredApiKeys }),
		deleteApiKey: deleteApiKey<O>({ opts, schema, deleteAllExpiredApiKeys }),
		listApiKeys: listApiKeys<O>({ opts, schema, deleteAllExpiredApiKeys }),
		deleteAllExpiredApiKeys: deleteAllExpiredApiKeysEndpoint({
			deleteAllExpiredApiKeys,
		}),
	};
}
