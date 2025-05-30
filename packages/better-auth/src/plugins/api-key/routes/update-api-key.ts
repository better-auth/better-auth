import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import { getDate } from "../../../utils/date";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { safeJSONParse } from "../../../utils/json";
import { API_KEY_TABLE_NAME } from "..";
export function updateApiKey({
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
		"/api-key/update",
		{
			method: "POST",
			body: z.object({
				keyId: z.string({
					description: "The id of the Api Key",
				}),
				userId: z.coerce.string().optional(),
				name: z
					.string({
						description: "The name of the key",
					})
					.optional(),
				enabled: z
					.boolean({
						description: "Whether the Api Key is enabled or not",
					})
					.optional(),
				remaining: z
					.number({
						description: "The number of remaining requests",
					})
					.min(1)
					.optional(),
				refillAmount: z
					.number({
						description: "The refill amount",
					})
					.optional(),
				refillInterval: z
					.number({
						description: "The refill interval",
					})
					.optional(),
				metadata: z
					.any({
						description: "The metadata of the Api Key",
					})
					.optional(),
				expiresIn: z
					.number({
						description: "Expiration time of the Api Key in seconds",
					})
					.min(1)
					.optional()
					.nullable(),
				rateLimitEnabled: z
					.boolean({
						description: "Whether the key has rate limiting enabled.",
					})
					.optional(),
				rateLimitTimeWindow: z
					.number({
						description:
							"The duration in milliseconds where each request is counted.",
					})
					.optional(),
				rateLimitMax: z
					.number({
						description:
							"Maximum amount of requests allowed within a window. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset.",
					})
					.optional(),
				permissions: z
					.record(z.string(), z.array(z.string()))
					.optional()
					.nullable(),
			}),

			metadata: {
				openapi: {
					description: "Retrieve an existing API key by ID",
					responses: {
						"200": {
							description: "API key retrieved successfully",
							content: {
								"application/json": {
									schema: {
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
		async (ctx) => {
			const {
				keyId,
				expiresIn,
				enabled,
				metadata,
				refillAmount,
				refillInterval,
				remaining,
				name,
				permissions,
				rateLimitEnabled,
				rateLimitTimeWindow,
				rateLimitMax,
			} = ctx.body;

			const session = await getSessionFromCtx(ctx);
			const authRequired = (ctx.request || ctx.headers) && !ctx.body.userId;
			const user =
				session?.user ?? (authRequired ? null : { id: ctx.body.userId });
			if (!user?.id) {
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.UNAUTHORIZED_SESSION,
				});
			}

			if (authRequired) {
				// if this endpoint was being called from the client,
				// we must make sure they can't use server-only properties.
				if (
					refillAmount !== undefined ||
					refillInterval !== undefined ||
					rateLimitMax !== undefined ||
					rateLimitTimeWindow !== undefined ||
					rateLimitEnabled !== undefined ||
					remaining !== undefined ||
					permissions !== undefined
				) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.SERVER_ONLY_PROPERTY,
					});
				}
			}

			const apiKey = await ctx.context.adapter.findOne<ApiKey>({
				model: API_KEY_TABLE_NAME,
				where: [
					{
						field: "id",
						value: keyId,
					},
					{
						field: "userId",
						value: user.id,
					},
				],
			});

			if (!apiKey) {
				throw new APIError("NOT_FOUND", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}

			let newValues: Partial<ApiKey> = {};

			if (name !== undefined) {
				if (name.length < opts.minimumNameLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_NAME_LENGTH,
					});
				} else if (name.length > opts.maximumNameLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_NAME_LENGTH,
					});
				}
				newValues.name = name;
			}

			if (enabled !== undefined) {
				newValues.enabled = enabled;
			}
			if (expiresIn !== undefined) {
				if (opts.keyExpiration.disableCustomExpiresTime === true) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.KEY_DISABLED_EXPIRATION,
					});
				}
				if (expiresIn !== null) {
					// if expires is not null, check if it's under the valid range
					// if it IS null, this means the user wants to disable expiration time on the key
					const expiresIn_in_days = expiresIn / (60 * 60 * 24);

					if (expiresIn_in_days < opts.keyExpiration.minExpiresIn) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
						});
					} else if (expiresIn_in_days > opts.keyExpiration.maxExpiresIn) {
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
						});
					}
				}
				newValues.expiresAt = expiresIn ? getDate(expiresIn, "sec") : null;
			}
			if (metadata !== undefined) {
				if (typeof metadata !== "object") {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_METADATA_TYPE,
					});
				}
				//@ts-ignore - we need this to be a string to save into DB.
				newValues.metadata =
					schema.apikey.fields.metadata.transform.input(metadata);
			}
			if (remaining !== undefined) {
				newValues.remaining = remaining;
			}
			if (refillAmount !== undefined || refillInterval !== undefined) {
				if (refillAmount !== undefined && refillInterval === undefined) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
					});
				} else if (refillInterval !== undefined && refillAmount === undefined) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
					});
				}
				newValues.refillAmount = refillAmount;
				newValues.refillInterval = refillInterval;
			}

			if (rateLimitEnabled !== undefined) {
				newValues.rateLimitEnabled = rateLimitEnabled;
			}
			if (rateLimitTimeWindow !== undefined) {
				newValues.rateLimitTimeWindow = rateLimitTimeWindow;
			}
			if (rateLimitMax !== undefined) {
				newValues.rateLimitMax = rateLimitMax;
			}

			if (permissions !== undefined) {
				//@ts-ignore - we need this to be a string to save into DB.
				newValues.permissions = JSON.stringify(permissions);
			}

			if (Object.keys(newValues).length === 0) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.NO_VALUES_TO_UPDATE,
				});
			}

			let newApiKey: ApiKey = apiKey;
			try {
				let result = await ctx.context.adapter.update<ApiKey>({
					model: API_KEY_TABLE_NAME,
					where: [
						{
							field: "id",
							value: apiKey.id,
						},
						{
							field: "userId",
							value: user.id,
						},
					],
					update: {
						lastRequest: new Date(),
						remaining: apiKey.remaining === null ? null : apiKey.remaining - 1,
						...newValues,
					},
				});
				if (result) newApiKey = result;
			} catch (error: any) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: error?.message,
				});
			}

			deleteAllExpiredApiKeys(ctx.context);

			// transform metadata from string back to object
			newApiKey.metadata = schema.apikey.fields.metadata.transform.output(
				newApiKey.metadata as never as string,
			);

			const { key, ...returningApiKey } = newApiKey;

			return ctx.json({
				...returningApiKey,
				permissions: returningApiKey.permissions
					? safeJSONParse<{
							[key: string]: string[];
						}>(
							//@ts-ignore - from DB, this value is always a string
							returningApiKey.permissions,
						)
					: null,
			});
		},
	);
}
