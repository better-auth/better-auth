//@ts-nocheck
import {
	// biome-ignore lint/correctness/noUnusedImports: <explanation>
	createAuthEndpoint,
	// biome-ignore lint/correctness/noUnusedImports: <explanation>
	orgMiddleware,
	// biome-ignore lint/correctness/noUnusedImports: <explanation>
	orgSessionMiddleware,
	// biome-ignore lint/correctness/noUnusedImports: <explanation>
	requestOnlySessionMiddleware,
	// biome-ignore lint/correctness/noUnusedImports: <explanation>
	sessionMiddleware,
} from "./index";
// biome-ignore lint/correctness/noUnusedImports: <explanation>
import { z } from "zod";

export const viewBackupCodes = createAuthEndpoint(
	"/two-factor/view-backup-codes",
	{
		method: "GET",
		body: z.object({
			userId: z.coerce.string({
				description: `The user ID to view all backup codes. Eg: "user-id"`
			}),
		}),
		metadata: {
			SERVER_ONLY: true,
		},
	},
	async (ctx) => {
		const twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
			model: twoFactorTable,
			where: [
				{
					field: "userId",
					value: ctx.body.userId,
				},
			],
		});
		if (!twoFactor) {
			throw new APIError("BAD_REQUEST", {
				message: "Backup codes aren't enabled",
			});
		}
		const backupCodes = await getBackupCodes(
			twoFactor.backupCodes,
			ctx.context.secret,
		);
		if (!backupCodes) {
			throw new APIError("BAD_REQUEST", {
				message: TWO_FACTOR_ERROR_CODES.BACKUP_CODES_NOT_ENABLED,
			});
		}
		return ctx.json({
			status: true,
			backupCodes: backupCodes,
		});
	},
)