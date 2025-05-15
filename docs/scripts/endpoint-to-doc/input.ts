//@ts-nocheck
import { createAuthEndpoint, sessionMiddleware } from "./index";
import { z } from "zod";

export const deleteAllExpiredApiKeys = createAuthEndpoint(
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