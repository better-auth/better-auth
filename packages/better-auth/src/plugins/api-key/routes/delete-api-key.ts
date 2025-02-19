import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey, ApiKeyOptions } from "../types";
import type { PredefinedApiKeyOptions } from "./internal.types";
import type { AuthContext } from "../../../types";

export function deleteApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys
}: {
	opts: ApiKeyOptions & Required<Pick<ApiKeyOptions, PredefinedApiKeyOptions>>;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(ctx: AuthContext, byPassLastCheckTime?: boolean): Promise<number> | undefined
}) {
	return createAuthEndpoint(
		"/api-key/delete",
		{
			method: "DELETE",
			body: z.object({
				keyId: z.string({
					description: "The id of the Api Key",
				}),
			}),
			metadata: {
				SERVER_ONLY: true,
			},
		},
		async (ctx) => {
			const { keyId } = ctx.body;

			// make sure that the user has a session.
			if (!ctx.context.session) {
				opts.events?.({
					event: "key.delete",
					success: false,
					error_code: "user.unauthorized",
					error_message: ERROR_CODES.UNAUTHORIZED_SESSION,
					user: null,
					apiKey: null,
				});
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.UNAUTHORIZED_SESSION,
				});
			}

			// make sure that the user is not banned.
			if (ctx.context.session.user.banned === true) {
				opts.events?.({
					event: "key.delete",
					success: false,
					error_code: "user.forbidden",
					error_message: ERROR_CODES.USER_BANNED,
					user: null,
					apiKey: null,
				});

				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.USER_BANNED,
				});
			}

			const apiKey = await ctx.context.adapter.findOne<ApiKey>({
				model: schema.apikey.modelName,
				where: [
					{
						field: "id",
						value: keyId,
					},
					{
						field: "userId",
						value: ctx.context.session.user.id,
					},
				],
			});

			// No api key found
			if (!apiKey) {
				opts.events?.({
					event: "key.delete",
					success: false,
					error_code: "key.notFound",
					error_message: ERROR_CODES.KEY_NOT_FOUND,
					user: ctx.context.session.user,
					apiKey: null,
				});
				throw new APIError("NOT_FOUND", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}

			try {
				await ctx.context.adapter.delete<ApiKey>({
					model: schema.apikey.modelName,
					where: [
						{
							field: "id",
							value: apiKey.id,
						},
						{
							field: "userId",
							value: ctx.context.session.user.id,
						},
					],
				});
			} catch (error: any) {
				opts.events?.({
					event: "key.delete",
					success: false,
					error_code: "database.error",
					error_message: error?.message,
					user: ctx.context.session.user,
					apiKey: apiKey,
				});
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: error?.message,
				});
			}

			deleteAllExpiredApiKeys(ctx.context)

			opts.events?.({
				event: "key.delete",
				success: true,
				error_code: null,
				error_message: null,
				user: ctx.context.session.user,
				apiKey: null,
			});
			return ctx.json({
				success: true,
			});
		},
	);
}
