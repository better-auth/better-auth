import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { API_KEY_TABLE_NAME, ERROR_CODES } from "..";
import { getDate } from "../../../utils/date";
import { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { safeJSONParse } from "../../../utils/json";
import { defaultKeyHasher } from "../";

export function createApiKey({
	keyGenerator,
	opts,
	schema,
	deleteAllExpiredApiKeys,
}: {
	keyGenerator: (options: { length: number; prefix: string | undefined }) =>
		| Promise<string>
		| string;
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	deleteAllExpiredApiKeys(
		ctx: AuthContext,
		byPassLastCheckTime?: boolean,
	): Promise<number> | undefined;
}) {
	return createAuthEndpoint(
		"/api-key/create",
		{
			method: "POST",
			body: z.object({
				name: z.string({ description: "Name of the Api Key" }).optional(),
				expiresIn: z
					.number({
						description: "Expiration time of the Api Key in seconds",
					})
					.min(1)
					.optional()
					.nullable()
					.default(null),

				userId: z.coerce
					.string({
						description:
							"User Id of the user that the Api Key belongs to. Useful for server-side only.",
					})
					.optional(),
				prefix: z
					.string({ description: "Prefix of the Api Key" })
					.regex(/^[a-zA-Z0-9_-]+$/, {
						message:
							"Invalid prefix format, must be alphanumeric and contain only underscores and hyphens.",
					})
					.optional(),
				remaining: z
					.number({
						description: "Remaining number of requests. Server side only",
					})
					.min(0)
					.optional()
					.nullable()
					.default(null),
				metadata: z.any({ description: "Metadata of the Api Key" }).optional(),
				refillAmount: z
					.number({
						description:
							"Amount to refill the remaining count of the Api Key. Server Only Property",
					})
					.min(1)
					.optional(),
				refillInterval: z
					.number({
						description:
							"Interval to refill the Api Key in milliseconds. Server Only Property.",
					})
					.optional(),
				rateLimitTimeWindow: z
					.number({
						description:
							"The duration in milliseconds where each request is counted. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset. Server Only Property.",
					})
					.optional(),
				rateLimitMax: z
					.number({
						description:
							"Maximum amount of requests allowed within a window. Once the `maxRequests` is reached, the request will be rejected until the `timeWindow` has passed, at which point the `timeWindow` will be reset. Server Only Property.",
					})
					.optional(),
				rateLimitEnabled: z
					.boolean({
						description:
							"Whether the key has rate limiting enabled. Server Only Property.",
					})
					.optional(),
				permissions: z.record(z.string(), z.array(z.string())).optional(),
			}),
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
				remaining: remaining || refillAmount || null,
				refillAmount: refillAmount ?? null,
				refillInterval: refillInterval ?? null,
				rateLimitEnabled:
					rateLimitEnabled === undefined
						? opts.rateLimit.enabled ?? true
						: rateLimitEnabled,
				requestCount: 0,
				//@ts-ignore - we intentionally save the permissions as string on DB.
				permissions: permissionsToApply,
			};

			if (metadata) {
				//@ts-expect-error - we intentionally save the metadata as string on DB.
				data.metadata = schema.apikey.fields.metadata.transform.input(metadata);
			}

			const apiKey = await ctx.context.adapter.create<
				Omit<ApiKey, "id">,
				ApiKey
			>({
				model: API_KEY_TABLE_NAME,
				data: data,
			});

			return ctx.json({
				...(apiKey as ApiKey),
				key: key,
				metadata: metadata ?? null,
				permissions: apiKey.permissions
					? safeJSONParse(
							//@ts-ignore - from DB, this value is always a string
							apiKey.permissions,
						)
					: null,
			});
		},
	);
}
