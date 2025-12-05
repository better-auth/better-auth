import type { AuthContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { safeJSONParse } from "@better-auth/core/utils";
import * as z from "zod";
import { APIError, getSessionFromCtx } from "../../../api";
import { generateId } from "../../../utils";
import { getDate } from "../../../utils/date";
import { API_KEY_TABLE_NAME, ERROR_CODES } from "..";
import { defaultKeyHasher } from "../";
import { setApiKey } from "../adapter";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { PredefinedApiKeyOptions } from ".";

const createApiKeyBodySchema = z.object({
	name: z.string().meta({ description: "Name of the Api Key" }).optional(),
	expiresIn: z
		.number()
		.meta({
			description: "Expiration time of the Api Key in seconds",
		})
		.min(1)
		.optional()
		.nullable()
		.default(null),

	userId: z.coerce
		.string()
		.meta({
			description:
				'User Id of the user that the Api Key belongs to. server-only. Eg: "user-id"',
		})
		.optional(),
	prefix: z
		.string()
		.meta({ description: "Prefix of the Api Key" })
		.regex(/^[a-zA-Z0-9_-]+$/, {
			message:
				"Invalid prefix format, must be alphanumeric and contain only underscores and hyphens.",
		})
		.optional(),
	remaining: z
		.number()
		.meta({
			description: "Remaining number of requests. Server side only",
		})
		.min(0)
		.optional()
		.nullable()
		.default(null),
	metadata: z.any().optional(),
	refillAmount: z
		.number()
		.meta({
			description:
				"Amount to refill the remaining count of the Api Key. server-only. Eg: 100",
		})
		.min(1)
		.optional(),
	refillInterval: z
		.number()
		.meta({
			description:
				"Interval to refill the Api Key in milliseconds. server-only. Eg: 1000",
		})
		.optional(),
	rateLimitTimeWindow: z
		.number()
		.meta({
			description:
				"The duration in milliseconds where each request is counted. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset. server-only. Eg: 1000",
		})
		.optional(),
	rateLimitMax: z
		.number()
		.meta({
			description:
				"Maximum amount of requests allowed within a window. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset. server-only. Eg: 100",
		})
		.optional(),
	rateLimitEnabled: z
		.boolean()
		.meta({
			description:
				"Whether the key has rate limiting enabled. server-only. Eg: true",
		})
		.optional(),
	permissions: z
		.record(z.string(), z.array(z.string()))
		.meta({
			description: "Permissions of the Api Key.",
		})
		.optional(),
});

export function createApiKey({
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
		byPassLastCheckTime?: boolean | undefined,
	): void;
}) {
	return createAuthEndpoint(
		"/api-key/create",
		{
			method: "POST",
			body: createApiKeyBodySchema,
			metadata: {
				openapi: {
					description: "Create a new API key for a user",
					responses: {
						"200": {
							description: "API key created successfully",
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
													"The full API key (only returned on creation)",
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
			const {
				name,
				expiresIn,
				prefix,
				remaining,
				metadata,
				refillAmount,
				refillInterval,
				permissions,
				rateLimitMax,
				rateLimitTimeWindow,
				rateLimitEnabled,
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
					permissions !== undefined ||
					remaining !== null
				) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.SERVER_ONLY_PROPERTY,
					});
				}
			}

			// if metadata is defined, than check that it's an object.
			if (metadata) {
				if (opts.enableMetadata === false) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.METADATA_DISABLED,
					});
				}
				if (typeof metadata !== "object") {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_METADATA_TYPE,
					});
				}
			}

			// make sure that if they pass a refill amount, they also pass a refill interval
			if (refillAmount && !refillInterval) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
				});
			}
			// make sure that if they pass a refill interval, they also pass a refill amount
			if (refillInterval && !refillAmount) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
				});
			}

			if (expiresIn) {
				if (opts.keyExpiration.disableCustomExpiresTime === true) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.KEY_DISABLED_EXPIRATION,
					});
				}

				const expiresIn_in_days = expiresIn / (60 * 60 * 24);

				if (opts.keyExpiration.minExpiresIn > expiresIn_in_days) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
					});
				} else if (opts.keyExpiration.maxExpiresIn < expiresIn_in_days) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
					});
				}
			}
			if (prefix) {
				if (prefix.length < opts.minimumPrefixLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_PREFIX_LENGTH,
					});
				}
				if (prefix.length > opts.maximumPrefixLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_PREFIX_LENGTH,
					});
				}
			}

			if (name) {
				if (name.length < opts.minimumNameLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_NAME_LENGTH,
					});
				}
				if (name.length > opts.maximumNameLength) {
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_NAME_LENGTH,
					});
				}
			} else if (opts.requireName) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.NAME_REQUIRED,
				});
			}

			deleteAllExpiredApiKeys(ctx.context);

			const key = await keyGenerator({
				length: opts.defaultKeyLength,
				prefix: prefix || opts.defaultPrefix,
			});

			const hashed = opts.disableKeyHashing ? key : await defaultKeyHasher(key);

			let start: string | null = null;

			if (opts.startingCharactersConfig.shouldStore) {
				start = key.substring(
					0,
					opts.startingCharactersConfig.charactersLength,
				);
			}

			const defaultPermissions = opts.permissions?.defaultPermissions
				? typeof opts.permissions.defaultPermissions === "function"
					? await opts.permissions.defaultPermissions(user.id, ctx)
					: opts.permissions.defaultPermissions
				: undefined;
			const permissionsToApply = permissions
				? JSON.stringify(permissions)
				: defaultPermissions
					? JSON.stringify(defaultPermissions)
					: undefined;

			let data: Omit<ApiKey, "id"> = {
				createdAt: new Date(),
				updatedAt: new Date(),
				name: name ?? null,
				prefix: prefix ?? opts.defaultPrefix ?? null,
				start: start,
				key: hashed,
				enabled: true,
				expiresAt: expiresIn
					? getDate(expiresIn, "sec")
					: opts.keyExpiration.defaultExpiresIn
						? getDate(opts.keyExpiration.defaultExpiresIn, "sec")
						: null,
				userId: user.id,
				lastRefillAt: null,
				lastRequest: null,
				metadata: null,
				rateLimitMax: rateLimitMax ?? opts.rateLimit.maxRequests ?? null,
				rateLimitTimeWindow:
					rateLimitTimeWindow ?? opts.rateLimit.timeWindow ?? null,
				remaining:
					remaining === null ? remaining : (remaining ?? refillAmount ?? null),
				refillAmount: refillAmount ?? null,
				refillInterval: refillInterval ?? null,
				rateLimitEnabled:
					rateLimitEnabled === undefined
						? (opts.rateLimit.enabled ?? true)
						: rateLimitEnabled,
				requestCount: 0,
				//@ts-expect-error - we intentionally save the permissions as string on DB.
				permissions: permissionsToApply,
			};

			if (metadata) {
				//@ts-expect-error - we intentionally save the metadata as string on DB.
				data.metadata = schema.apikey.fields.metadata.transform.input(metadata);
			}

			let apiKey: ApiKey;

			if (opts.storage === "secondary-storage" && opts.fallbackToDatabase) {
				apiKey = await ctx.context.adapter.create<Omit<ApiKey, "id">, ApiKey>({
					model: API_KEY_TABLE_NAME,
					data: data,
				});
				await setApiKey(ctx, apiKey, opts);
			} else if (opts.storage === "secondary-storage") {
				const id =
					ctx.context.generateId({
						model: API_KEY_TABLE_NAME,
					}) ?? generateId();
				apiKey = {
					...data,
					id,
				} as ApiKey;
				await setApiKey(ctx, apiKey, opts);
			} else {
				apiKey = await ctx.context.adapter.create<Omit<ApiKey, "id">, ApiKey>({
					model: API_KEY_TABLE_NAME,
					data: data,
				});
			}

			return ctx.json({
				...(apiKey as ApiKey),
				key: key,
				metadata: metadata ?? null,
				permissions: apiKey.permissions
					? safeJSONParse(apiKey.permissions)
					: null,
			});
		},
	);
}
