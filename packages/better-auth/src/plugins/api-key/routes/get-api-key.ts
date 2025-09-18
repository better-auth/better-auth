import { APIError, sessionMiddleware } from "../../../api";
import { implEndpoint } from "../../../better-call/server";
import { getApiKeyDef } from "../shared";
import { API_KEY_TABLE_NAME, ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { safeJSONParse } from "../../../utils/json";

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
	): void;
}) {
	return implEndpoint(
		getApiKeyDef,
		{
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const { id } = ctx.query;

			const session = ctx.context.session;

			let apiKey = await ctx.context.adapter.findOne<ApiKey>({
				model: API_KEY_TABLE_NAME,
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

			return ctx.json({
				...returningApiKey,
				permissions: returningApiKey.permissions
					? safeJSONParse<{
							[key: string]: string[];
						}>(returningApiKey.permissions)
					: null,
			});
		},
	);
}
