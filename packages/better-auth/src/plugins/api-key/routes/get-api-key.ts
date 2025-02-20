import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";

export function getApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): Promise<number> | undefined;
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

			const session = await getSessionFromCtx(ctx);

			// make sure that the user has a session.
			if (!session) {
				opts.events?.({
					event: "key.get",
					success: false,
					error: {
						code: "user.unauthorized",
						message: ERROR_CODES.UNAUTHORIZED_SESSION,
					},
					user: null,
					apiKey: null,
				});
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.UNAUTHORIZED_SESSION,
				});
			}

			// make sure that the user is not banned.
			if (session.user.banned === true) {
				opts.events?.({
					event: "key.get",
					success: false,
					error: {
						code: "user.forbidden",
						message: ERROR_CODES.USER_BANNED,
					},
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
						value: session.user.id,
					},
				],
			});

			if (!apiKey) {
				// key is not found
				opts.events?.({
					event: "key.get",
					success: false,
					error: {
						code: "key.notFound",
						message: ERROR_CODES.KEY_NOT_FOUND,
					},
					user: session.user,
					apiKey: null,
				});
				throw new APIError("NOT_FOUND", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}
			deleteAllExpiredApiKeys(ctx.context);

			opts.events?.({
				event: "key.get",
				success: true,
				error: null,
				user: session.user,
				apiKey: apiKey,
			});
			let returningApiKey: Partial<ApiKey> = apiKey;

			// biome-ignore lint/performance/noDelete: If we set this to `undefined`, the obj will still contain the `key` property, which looks ugly.
			delete returningApiKey["key"];

			return ctx.json(returningApiKey);
		},
	);
}
