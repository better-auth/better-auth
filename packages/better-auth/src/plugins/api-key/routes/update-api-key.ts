import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { safeJSONParse } from "@better-auth/core/utils";
import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../../api";
import { getDate } from "../../../utils/date";
import { API_KEY_TABLE_NAME, ERROR_CODES } from "..";
import { getApiKeyById, setApiKey } from "../adapter";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { PredefinedApiKeyOptions } from ".";

const updateApiKeyBodySchema = z.object({
	keyId: z.string().meta({
		description: "The id of the Api Key",
	}),
	userId: z.coerce
		.string()
		.meta({
			description:
				'The id of the user which the api key belongs to. server-only. Eg: "some-user-id"',
		})
		.optional(),
	name: z
		.string()
		.meta({
			description: "The name of the key",
		})
		.optional(),
	enabled: z
		.boolean()
		.meta({
			description: "Whether the Api Key is enabled or not",
		})
		.optional(),
	remaining: z
		.number()
		.meta({
			description: "The number of remaining requests",
		})
		.min(1)
		.optional(),
	refillAmount: z
		.number()
		.meta({
			description: "The refill amount",
		})
		.optional(),
	refillInterval: z
		.number()
		.meta({
			description: "The refill interval",
		})
		.optional(),
	metadata: z.any().optional(),
	expiresIn: z
		.number()
		.meta({
			description: "Expiration time of the Api Key in seconds",
		})
		.min(1)
		.optional()
		.nullable(),
	rateLimitEnabled: z
		.boolean()
		.meta({
			description: "Whether the key has rate limiting enabled.",
		})
		.optional(),
	rateLimitTimeWindow: z
		.number()
		.meta({
			description:
				"The duration in milliseconds where each request is counted. server-only. Eg: 1000",
		})
		.optional(),
	rateLimitMax: z
		.number()
		.meta({
			description:
				"Maximum amount of requests allowed within a window. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset. server-only. Eg: 100",
		})
		.optional(),
	permissions: z
		.record(z.string(), z.array(z.string()))
		.meta({
			description: "Update the permissions on the API Key. server-only.",
		})
		.optional()
		.nullable(),
});

export function updateApiKey({
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean | undefined,
	): void;
}) {
	return createAuthEndpoint(
		"/api-key/update",
		{
			method: "POST",
			body: updateApiKeyBodySchema,
			metadata: {
				openapi: {
					description: "Update an existing API key by ID",
					responses: {
						"200": {
							description: "API key updated successfully",
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
													"The interval in milliseconds between refills of the `remaining` count. Example: 3600000 // refill every hour (3600000ms = 1h)",
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
			const authRequired = ctx.request || ctx.headers;
			const user =
				authRequired && !session
					? null
					: session?.user || { id: ctx.body.userId };

			if (!user?.id) {
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.UNAUTHORIZED_SESSION,
				});
			}

			if (session && ctx.body.userId && session?.user.id !== ctx.body.userId) {
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

			let apiKey: ApiKey | null = null;

			apiKey = await getApiKeyById(ctx, keyId, opts);

			// Verify ownership
			if (apiKey && apiKey.userId !== user.id) {
				apiKey = null;
			}

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
				//@ts-expect-error - we need this to be a string to save into DB.
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
				//@ts-expect-error - we need this to be a string to save into DB.
				newValues.permissions = JSON.stringify(permissions);
			}

			if (Object.keys(newValues).length === 0) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.NO_VALUES_TO_UPDATE,
				});
			}

			let newApiKey: ApiKey = apiKey;
			try {
				if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
					const dbUpdated = await ctx.context.adapter.update<ApiKey>({
						model: API_KEY_TABLE_NAME,
						where: [
							{
								field: "id",
								value: apiKey.id,
							},
						],
						update: newValues,
					});
					if (dbUpdated) {
						await setApiKey(ctx, dbUpdated, opts);
						newApiKey = dbUpdated;
					}
				} else if (opts.storage === "database") {
					const result = await ctx.context.adapter.update<ApiKey>({
						model: API_KEY_TABLE_NAME,
						where: [
							{
								field: "id",
								value: apiKey.id,
							},
						],
						update: newValues,
					});
					if (result) newApiKey = result;
				} else {
					const updated: ApiKey = {
						...apiKey,
						...newValues,
						updatedAt: new Date(),
					};
					await setApiKey(ctx, updated, opts);
					newApiKey = updated;
				}
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
						}>(returningApiKey.permissions)
					: null,
			});
		},
	);
}
