import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { PredefinedApiKeyOptions } from ".";

export function deleteAllExpiredApiKeysEndpoint({
	configurations,
	deleteAllExpiredApiKeys,
}: {
	configurations: PredefinedApiKeyOptions[];
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		configurations: PredefinedApiKeyOptions[],
		byPassLastCheckTime?: boolean | undefined,
	): Promise<void>;
}) {
	return createAuthEndpoint(
		{
			method: "POST",
		},
		async (ctx) => {
			try {
				await deleteAllExpiredApiKeys(ctx.context, configurations, true);
			} catch (error) {
				ctx.context.logger.error(
					"[API KEY PLUGIN] Failed to delete expired API keys:",
					error,
				);
				return ctx.json({
					success: false,
					error: error,
				});
			}

			return ctx.json({ success: true, error: null });
		},
	);
}
