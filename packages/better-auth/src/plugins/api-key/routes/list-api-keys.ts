import { createAuthEndpoint, sessionMiddleware } from "../../../api";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { safeJSONParse } from "../../../utils/json";
import { API_KEY_TABLE_NAME } from "..";
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
			metadata: {
				openapi: {
					description: "List all API keys for the authenticated user",
					responses: {
						"200": {
							description: "API keys retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
											type: "object",
											properties: {
												id: {
													type: "string",
													description: "ID",
												},
												name: {
													type: "string",
													nullable: true,
													description: "The name of the key",
												},
												start: {
													type: "string",
													nullable: true,
													description:
														"Shows the first few characters of the API key, including the prefix. This allows you to show those few characters in the UI to make it easier for users to identify the API key.",
												},
												prefix: {
													type: "string",
													nullable: true,
													description:
														"The API Key prefix. Stored as plain text.",
												},
												userId: {
													type: "string",
													description: "The owner of the user id",
												},
												refillInterval: {
													type: "number",
													nullable: true,
													description:
														"The interval in which the `remaining` count is refilled by day. Example: 1 // every day",
												},
												refillAmount: {
													type: "number",
													nullable: true,
													description: "The amount to refill",
												},
												lastRefillAt: {
													type: "string",
													format: "date-time",
													nullable: true,
													description: "The last refill date",
												},
												enabled: {
													type: "boolean",
													description: "Sets if key is enabled or disabled",
													default: true,
												},
												rateLimitEnabled: {
													type: "boolean",
													description:
														"Whether the key has rate limiting enabled",
												},
												rateLimitTimeWindow: {
													type: "number",
													nullable: true,
													description: "The duration in milliseconds",
												},
												rateLimitMax: {
													type: "number",
													nullable: true,
													description:
														"Maximum amount of requests allowed within a window",
												},
												requestCount: {
													type: "number",
													description:
														"The number of requests made within the rate limit time window",
												},
												remaining: {
													type: "number",
													nullable: true,
													description:
														"Remaining requests (every time api key is used this should updated and should be updated on refill as well)",
												},
												lastRequest: {
													type: "string",
													format: "date-time",
													nullable: true,
													description: "When last request occurred",
												},
												expiresAt: {
													type: "string",
													format: "date-time",
													nullable: true,
													description: "Expiry date of a key",
												},
												createdAt: {
													type: "string",
													format: "date-time",
													description: "created at",
												},
												updatedAt: {
													type: "string",
													format: "date-time",
													description: "updated at",
												},
												metadata: {
													type: "object",
													nullable: true,
													additionalProperties: true,
													description: "Extra metadata about the apiKey",
												},
												permissions: {
													type: "string",
													nullable: true,
													description:
														"Permissions for the api key (stored as JSON string)",
												},
											},
											required: [
												"id",
												"userId",
												"enabled",
												"rateLimitEnabled",
												"requestCount",
												"createdAt",
												"updatedAt",
											],
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			let apiKeys = await ctx.context.adapter.findMany<ApiKey>({
				model: API_KEY_TABLE_NAME,
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
				return {
					...returningApiKey,
					permissions: returningApiKey.permissions
						? safeJSONParse<{
								[key: string]: string[];
							}>(
								//@ts-ignore - From DB this is always a string
								returningApiKey.permissions,
							)
						: null,
				};
			});

			return ctx.json(returningApiKey);
		},
	);
}
