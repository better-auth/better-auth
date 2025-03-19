import { z } from "zod";
import { APIError, createAuthEndpoint, sessionMiddleware } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { API_KEY_TABLE } from "../constant";

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
			query: z.object({
				id: z.string({
					description: "The id of the Api Key",
				}),
			}),
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const { id } = ctx.query;

			const session = ctx.context.session;

			let apiKey = await ctx.context.adapter.findOne<ApiKey>({
				model: API_KEY_TABLE,
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
				throw new APIError("NOT_FOUND", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}

			deleteAllExpiredApiKeys(ctx.context);

			// convert metadata string back to object
			apiKey.metadata = schema.apikey.fields.metadata.transform.output(
				apiKey.metadata as never as string,
			);

			const { key, ...returningApiKey } = apiKey;

			return ctx.json(returningApiKey);
		},
	);
}
