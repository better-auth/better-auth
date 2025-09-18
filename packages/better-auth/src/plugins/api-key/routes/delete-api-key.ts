import { APIError, sessionMiddleware } from "../../../api";
import { implEndpoint } from "../../../better-call/server";
import { deleteApiKeyDef } from "../shared";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { API_KEY_TABLE_NAME } from "..";
export function deleteApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): void;
}) {
	return implEndpoint(
		deleteApiKeyDef,
		{
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const { keyId } = ctx.body;
			const session = ctx.context.session;
			if (session.user.banned === true) {
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.USER_BANNED,
				});
			}
			const apiKey = await ctx.context.adapter.findOne<ApiKey>({
				model: API_KEY_TABLE_NAME,
				where: [
					{
						field: "id",
						value: keyId,
					},
				],
			});

			if (!apiKey || apiKey.userId !== session.user.id) {
				throw new APIError("NOT_FOUND", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}

			try {
				await ctx.context.adapter.delete<ApiKey>({
					model: API_KEY_TABLE_NAME,
					where: [
						{
							field: "id",
							value: apiKey.id,
						},
					],
				});
			} catch (error: any) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: error?.message,
				});
			}
			deleteAllExpiredApiKeys(ctx.context);
			return ctx.json({
				success: true,
			});
		},
	);
}
