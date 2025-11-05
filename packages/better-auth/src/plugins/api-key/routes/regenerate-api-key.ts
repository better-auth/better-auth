import type { AuthContext } from "@better-auth/core";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { z } from "zod";
import { APIError, createAuthEndpoint, sessionMiddleware } from "../../../api";
import { safeJSONParse } from "../../../utils/json";
import { API_KEY_TABLE_NAME, ERROR_CODES } from "..";
import { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { PredefinedApiKeyOptions } from ".";

export function regenerateApiKey({
	keyGenerator,
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	keyGenerator: (options: {
		length: number;
		prefix: string | undefined;
	}) => Promise<string> | string;
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): Promise<number> | undefined;
}) {
	return createAuthEndpoint(
		"/api-key/regenerate",
		{
			method: "POST",
			body: z.object({
				keyId: z.string().describe("The id of the Api Key to regenerate"),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description: "Regenerate an existing API key",
					requestBody: {
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										keyId: {
											type: "string",
											description: "The id of the API key to regenerate",
										},
									},
									required: ["keyId"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "API key regenerated successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description: "Unique identifier of the API key",
											},
											createdAt: {
												type: "string",
												format: "date-time",
												description: "Creation timestamp",
											},
											updatedAt: {
												type: "string",
												format: "date-time",
												description: "Last update timestamp",
											},
											name: {
												type: "string",
												nullable: true,
												description: "Name of the API key",
											},
											prefix: {
												type: "string",
												nullable: true,
												description: "Prefix of the API key",
											},
											start: {
												type: "string",
												nullable: true,
												description:
													"Starting characters of the key (if configured)",
											},
											key: {
												type: "string",
												description:
													"The full API key (only returned on creation/regeneration)",
											},
											enabled: {
												type: "boolean",
												description: "Whether the key is enabled",
											},
											expiresAt: {
												type: "string",
												format: "date-time",
												nullable: true,
												description: "Expiration timestamp",
											},
											userId: {
												type: "string",
												description: "ID of the user owning the key",
											},
											lastRefillAt: {
												type: "string",
												format: "date-time",
												nullable: true,
												description: "Last refill timestamp",
											},
											lastRequest: {
												type: "string",
												format: "date-time",
												nullable: true,
												description: "Last request timestamp",
											},
											metadata: {
												type: "object",
												nullable: true,
												additionalProperties: true,
												description: "Metadata associated with the key",
											},
											rateLimitMax: {
												type: "number",
												nullable: true,
												description: "Maximum requests in time window",
											},
											rateLimitTimeWindow: {
												type: "number",
												nullable: true,
												description: "Rate limit time window in milliseconds",
											},
											remaining: {
												type: "number",
												nullable: true,
												description: "Remaining requests",
											},
											refillAmount: {
												type: "number",
												nullable: true,
												description: "Amount to refill",
											},
											refillInterval: {
												type: "number",
												nullable: true,
												description: "Refill interval in milliseconds",
											},
											rateLimitEnabled: {
												type: "boolean",
												description: "Whether rate limiting is enabled",
											},
											requestCount: {
												type: "number",
												description: "Current request count in window",
											},
											permissions: {
												type: "object",
												nullable: true,
												additionalProperties: {
													type: "array",
													items: { type: "string" },
												},
												description: "Permissions associated with the key",
											},
										},
										required: [
											"id",
											"createdAt",
											"updatedAt",
											"key",
											"enabled",
											"userId",
											"rateLimitEnabled",
											"requestCount",
										],
									},
								},
							},
						},
					},
				},
			},
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

			const key = await keyGenerator({
				length: opts.defaultKeyLength,
				prefix: apiKey.prefix ?? opts.defaultPrefix, // Use existing prefix or default
			});

			const hash = await createHash("SHA-256").digest(key);
			const hashed = base64Url.encode(hash, {
				padding: false,
			});

			let start: string | null = null;

			if (opts.startingCharactersConfig.shouldStore) {
				start = key.substring(
					0,
					opts.startingCharactersConfig.charactersLength,
				);
			}

			let updatedApiKey: ApiKey;
			try {
				const result = await ctx.context.adapter.update<ApiKey>({
					model: API_KEY_TABLE_NAME,
					where: [
						{
							field: "id",
							value: apiKey.id,
						},
						{
							field: "userId",
							value: session.user.id,
						},
					],
					update: {
						key: hashed,
						start: start,
						updatedAt: new Date(),
					},
				});

				if (!result) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message:
							"Failed to update API key: Record not found for the given user or update was unsuccessful.",
					});
				}
				updatedApiKey = result;
			} catch (error: any) {
				if (error instanceof APIError) {
					throw error;
				}
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message:
						error?.message ??
						"An unexpected error occurred while regenerating the API key.",
				});
			}

			await deleteAllExpiredApiKeys(ctx.context);

			return ctx.json({
				...(updatedApiKey as ApiKey),
				key: key,
				metadata: updatedApiKey.metadata
					? safeJSONParse(updatedApiKey.metadata)
					: null,
				permissions: updatedApiKey.permissions
					? safeJSONParse(updatedApiKey.permissions)
					: null,
			});
		},
	);
}
