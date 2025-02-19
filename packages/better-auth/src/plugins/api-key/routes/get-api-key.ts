import { z } from "zod";
import { APIError, createAuthEndpoint } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey, ApiKeyOptions } from "../types";
import type { PredefinedApiKeyOptions } from "./internal.types";

export function getApiKey({
	opts,
	schema,
}: {
	opts: ApiKeyOptions & Required<Pick<ApiKeyOptions, PredefinedApiKeyOptions>>;
	schema: ReturnType<typeof apiKeySchema>;
}) {
	return createAuthEndpoint(
		"/api-key/get",
		{
			method: "GET",
			body: z.object({
				id: z.string({
					description: "The id of the Api Key",
				}),
			}),
		},
		async (ctx) => {
			const { id } = ctx.body;

			// make sure that the user has a session.
			if (!ctx.context.session) {
				opts.events?.({
					event: "key.get",
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
					event: "key.get",
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
						value: id,
					},
					{
						field: "userId",
						value: ctx.context.session.user.id,
					}
				],
			});

			if (!apiKey) {
                // key is not found
				opts.events?.({
					event: "key.get",
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

			opts.events?.({
				event: "key.get",
				success: true,
				error_code: null,
				error_message: null,
				user: ctx.context.session.user,
				apiKey: apiKey,
			});
			return ctx.json({
				apiKey: {
					...apiKey,
                    key: undefined
				},
			});
		},
	);
}
