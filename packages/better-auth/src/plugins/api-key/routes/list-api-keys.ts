import { createAuthEndpoint, sessionMiddleware } from "../../../api";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";

export function listApiKeys({
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
		"/api-key/list",
		{
			method: "GET",
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const session = ctx.context.session;
			let apiKeys = await ctx.context.adapter.findMany<ApiKey>({
				model: schema.apikey.modelName,
				where: [
					{
						field: "userId",
						value: session.user.id,
					},
				],
			});

			deleteAllExpiredApiKeys(ctx.context);
			apiKeys = apiKeys.map((apiKey) => {
				return {
					...apiKey,
					metadata: schema.apikey.fields.metadata.transform.output(
						apiKey.metadata as never as string,
					),
				};
			});

			let returningApiKey = apiKeys.map((x) => {
				const { key, ...returningApiKey } = x;
				return returningApiKey;
			});

			return ctx.json(returningApiKey);
		},
	);
}
