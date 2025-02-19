import type { AuthContext } from "../../../types";
import type { apiKeySchema } from "../schema";
import type { ApiKey, ApiKeyOptions } from "../types";
import { createApiKey } from "./create-api-key";
import { deleteApiKey } from "./delete-api-key";
import { getApiKey } from "./get-api-key";
import type { PredefinedApiKeyOptions } from "./internal.types";
import { updateApiKey } from "./update-api-key";
import { verifyApiKey } from "./verify-api-key";

export function createApiKeyRoutes({
	keyGenerator,
	opts,
	schema,
}: {
	keyGenerator: (options: { length: number; prefix: string | undefined }) =>
		| Promise<string>
		| string;
	opts: ApiKeyOptions & Required<Pick<ApiKeyOptions, PredefinedApiKeyOptions>>;
	schema: ReturnType<typeof apiKeySchema>;
}) {
	let lastChecked: Date | null = null;

	function deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime = false,
	) {
		if (lastChecked && !byPassLastCheckTime) {
			const now = new Date();
			const diff = now.getTime() - lastChecked.getTime();
			if (diff < 10000) {
				return;
			}
		}
		lastChecked = new Date();
		try {
			return ctx.adapter.deleteMany({
				model: schema.apikey.modelName,
				where: [
					{
						field: "expiresAt" satisfies keyof ApiKey,
						operator: "lt",
						value: new Date().getTime(),
					},
				],
			});
		} catch (error) {
			ctx.logger.error(`Failed to delete expired API keys:`, error);
		}
	}

	return {
		createApiKey: () =>
			createApiKey({
				keyGenerator,
				opts,
				schema,
				deleteAllExpiredApiKeys,
			}),
		verifyApiKey: () => verifyApiKey({ opts, schema, deleteAllExpiredApiKeys }),
		getApiKey: () => getApiKey({ opts, schema, deleteAllExpiredApiKeys }),
		updateApiKey: () => updateApiKey({ opts, schema, deleteAllExpiredApiKeys }),
		deleteApiKey: () => deleteApiKey({ opts, schema, deleteAllExpiredApiKeys }),
	};
}
