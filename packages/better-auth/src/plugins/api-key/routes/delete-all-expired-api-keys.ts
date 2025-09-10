import { createAuthEndpoint } from "../../../api";
import type { AuthContext } from "../../../types";

export function deleteAllExpiredApiKeysEndpoint({
	deleteAllExpiredApiKeys,
}: {
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): Promise<void>;
}) {
	return createAuthEndpoint(
		"/api-key/delete-all-expired-api-keys",
		{
			method: "POST",
			metadata: {
				SERVER_ONLY: true,
				client: false,
			},
		},
		async (ctx) => {
			try {
				await deleteAllExpiredApiKeys(ctx.context, true);
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
