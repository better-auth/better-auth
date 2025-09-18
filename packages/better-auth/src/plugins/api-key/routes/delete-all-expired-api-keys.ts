import { implEndpoint } from "../../../better-call/server";
import { deleteAllExpiredApiKeysDef } from "../shared";
import type { AuthContext } from "../../../types";

export function deleteAllExpiredApiKeysEndpoint({
	deleteAllExpiredApiKeys,
}: {
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): Promise<void>;
}) {
	return implEndpoint(deleteAllExpiredApiKeysDef, {}, async (ctx) => {
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
	});
}
