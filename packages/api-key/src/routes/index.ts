import type { AuthContext, Awaitable } from "@better-auth/core";
import { APIError } from "better-auth/api";
import { API_KEY_ERROR_CODES, API_KEY_TABLE_NAME } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey, ApiKeyConfigurationOptions } from "../types";
import { createApiKey } from "./create-api-key";
import { deleteAllExpiredApiKeysEndpoint } from "./delete-all-expired-api-keys";
import { deleteApiKey } from "./delete-api-key";
import { getApiKey } from "./get-api-key";
import { listApiKeys } from "./list-api-keys";
import { updateApiKey } from "./update-api-key";
import { verifyApiKey } from "./verify-api-key";

export type PredefinedApiKeyOptions = ApiKeyConfigurationOptions &
	Required<
		Pick<
			ApiKeyConfigurationOptions,
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
			| "deferUpdates"
		>
	> & {
		keyExpiration: Required<
			NonNullable<ApiKeyConfigurationOptions["keyExpiration"]>
		>;
		startingCharactersConfig: Required<
			NonNullable<ApiKeyConfigurationOptions["startingCharactersConfig"]>
		>;
		rateLimit: Required<NonNullable<ApiKeyConfigurationOptions["rateLimit"]>>;
	};

export function resolveConfiguration(
	authContext: AuthContext,
	configurations: PredefinedApiKeyOptions[],
	configId?: string | null,
): PredefinedApiKeyOptions {
	// Defined in a function to avoid running the code when not needed.
	// If ran unnecessarily, it could throw an error saying "No default api-key configuration found." when the configId is provided.
	const getDefaultConfig = () => {
		const defaultConfig = configurations.find(
			(c) => !c.configId || c.configId === "default",
		);
		if (!defaultConfig) {
			const message =
				"No default api-key configuration found. Either provide an api-key configuration with configId 'default' or provide a configuration with no `configId` set.";
			authContext.logger.error(message);
			const error = API_KEY_ERROR_CODES.NO_DEFAULT_API_KEY_CONFIGURATION_FOUND;
			throw APIError.from("BAD_REQUEST", error);
		}
		return { ...defaultConfig, configId: "default" };
	};
	if (!configId) return getDefaultConfig();
	return (
		configurations.find((c) => c.configId === configId) ?? getDefaultConfig()
	);
}

/**
 * Checks if a configId value represents the default configuration.
 * Treats null, undefined, and "default" as equivalent (all are default).
 * This handles backward compatibility for keys created before the configId field existed.
 */
export function isDefaultConfigId(
	configId: string | null | undefined,
): boolean {
	return !configId || configId === "default";
}

/**
 * Checks if two configId values match, treating null/undefined as "default".
 * This handles backward compatibility for keys created before the configId field existed.
 */
export function configIdMatches(
	keyConfigId: string | null | undefined,
	expectedConfigId: string | null | undefined,
): boolean {
	// Both are default (null, undefined, or "default")
	if (isDefaultConfigId(keyConfigId) && isDefaultConfigId(expectedConfigId)) {
		return true;
	}
	// Direct match
	return keyConfigId === expectedConfigId;
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

export function createApiKeyRoutes({
	defaultKeyGenerator,
	configurations,
	schema,
}: {
	defaultKeyGenerator: (options: {
		length: number;
		prefix: string | undefined;
	}) => Awaitable<string>;
	configurations: PredefinedApiKeyOptions[];
	schema: ReturnType<typeof apiKeySchema>;
}) {
	return {
		createApiKey: createApiKey({
			defaultKeyGenerator,
			configurations,
			schema,
			deleteAllExpiredApiKeys,
		}),
		verifyApiKey: verifyApiKey({
			configurations,
			schema,
			deleteAllExpiredApiKeys,
		}),
		getApiKey: getApiKey({ configurations, schema, deleteAllExpiredApiKeys }),
		updateApiKey: updateApiKey({
			configurations,
			schema,
			deleteAllExpiredApiKeys,
		}),
		deleteApiKey: deleteApiKey({
			configurations,
			schema,
			deleteAllExpiredApiKeys,
		}),
		listApiKeys: listApiKeys({
			configurations,
			schema,
			deleteAllExpiredApiKeys,
		}),
		deleteAllExpiredApiKeys: deleteAllExpiredApiKeysEndpoint({
			deleteAllExpiredApiKeys,
		}),
	};
}
