import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";

export function listApiKey({
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
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);

			// make sure that the user has a session.
			if (!session) {
				opts.events?.({
					event: "key.list",
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
					event: "key.list",
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

			// transform metadata from string to obj
			apiKeys = apiKeys.map((apiKey) => {
				return {
					...apiKey,
					metadata: schema.apikey.fields.metadata.transform.output(
						apiKey.metadata as never as string,
					),
				}
			})

			opts.events?.({
				event: "key.list",
				success: true,
				error: null,
				user: session.user,
				apiKey: apiKeys,
			});

			let returningApiKey: Partial<ApiKey>[] = apiKeys.map((x) => {
				let returningApiKey: Partial<ApiKey> = x;
				// biome-ignore lint/performance/noDelete: If we set this to `undefined`, the obj will still contain the `key` property, which looks ugly.
				delete returningApiKey["key"];
				return returningApiKey;
			});

			return ctx.json(returningApiKey);
		},
	);
}
