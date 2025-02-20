import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../../api";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import { getDate } from "../../../utils/date";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";

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
					.optional(),
				refillAmount: z
					.number({
						description: "The refill amount",
					})
					.optional(),
				metadata: z
					.any({
						description: "The metadata of the Api Key",
					})
					.optional(),
				expiresIn: z
					.number({
						description: "Expiration time of the Api Key in milliseconds",
					})
					.optional()
					.nullable()
					.default(null),
			}),
			metadata: {
				SERVER_ONLY: true,
			},
		},
		async (ctx) => {
			const {
				keyId,
				expiresIn,
				enabled,
				metadata,
				refillAmount,
				remaining,
				name,
			} = ctx.body;

			const session = await getSessionFromCtx(ctx);

			// make sure that the user has a session.
			if (!session) {
				opts.events?.({
					event: "key.update",
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
					event: "key.update",
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

			const apiKey = await ctx.context.adapter.findOne<ApiKey>({
				model: schema.apikey.modelName,
				where: [
					{
						field: "id",
						value: keyId,
					},
				],
			});

			// No api key found
			if (!apiKey) {
				opts.events?.({
					event: "key.update",
					success: false,
					error: {
						code: "key.notFound",
						message: ERROR_CODES.KEY_NOT_FOUND,
					},
					user: session.user,
					apiKey: null,
				});
				throw new APIError("NOT_FOUND", {
					message: ERROR_CODES.KEY_NOT_FOUND,
				});
			}

			let newValues: Partial<ApiKey> = {};

			if (name !== undefined) {
				if (name.length < opts.minimumNameLength) {
					opts.events?.({
						success: false,
						event: "key.update",
						apiKey: null,
						error: {
							code: "key.invalidNameLength",
							message: ERROR_CODES.INVALID_NAME_LENGTH,
							details: {
								maxLength: opts.maximumNameLength,
								recievedLength: name.length,
								minLength: opts.minimumNameLength,
							},
						},
						user: session.user,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_NAME_LENGTH,
					});
				} else if (name.length > opts.maximumNameLength) {
					opts.events?.({
						success: false,
						event: "key.update",
						apiKey: null,
						error: {
							code: "key.invalidNameLength",
							message: ERROR_CODES.INVALID_NAME_LENGTH,
							details: {
								maxLength: opts.maximumNameLength,
								recievedLength: name.length,
								minLength: opts.minimumNameLength,
							},
						},
						user: session.user,
					});
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
				if(opts.keyExpiration.disableCustomExpiresTime === true){
					opts.events?.({
						event: "key.update",
						success: false,
						error: {
							code: "key.disabledExpiration",
							message: ERROR_CODES.KEY_DISABLED_EXPIRATION,
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.KEY_DISABLED_EXPIRATION,
					});
				}
				if(expiresIn !== null){
					// if expires is not null, check if it's under the valid range
					// if it IS null, this means the user wants to disable expiration time on the key
					if(expiresIn < opts.keyExpiration.minExpiresIn){
						opts.events?.({
							event: "key.update",
							success: false,
							error: {
								code: "key.invalidExpiration",
								message: ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
							},
							user: session.user,
							apiKey: null,
						});
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.EXPIRES_IN_IS_TOO_SMALL,
						});
					}else if(expiresIn > opts.keyExpiration.maxExpiresIn){
						opts.events?.({
							event: "key.update",
							success: false,
							error: {
								code: "key.invalidExpiration",
								message: ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
							},
							user: session.user,
							apiKey: null,
						});
						throw new APIError("BAD_REQUEST", {
							message: ERROR_CODES.EXPIRES_IN_IS_TOO_LARGE,
						});
					}
				}
				newValues.expiresAt = expiresIn ? getDate(expiresIn, "ms") : null;
			}
			if (metadata !== undefined) {
				if (typeof metadata !== "object") {
					opts.events?.({
						event: "key.update",
						success: false,
						error: {
							code: "request.forbidden",
							message: ERROR_CODES.INVALID_METADATA_TYPE,
						},
						user: session.user,
						apiKey: null,
					});
					throw new APIError("BAD_REQUEST", {
						message: ERROR_CODES.INVALID_METADATA_TYPE,
					});
				}
				newValues.metadata = metadata;
			}
			if (remaining !== undefined) {
				newValues.remaining = remaining;
			}
			if (refillAmount !== undefined) {
				newValues.refillAmount = refillAmount;
			}

			if (Object.keys(newValues).length === 0) {
				opts.events?.({
					event: "key.update",
					success: false,
					error: {
						code: "request.noValuesToUpdate",
						message: ERROR_CODES.NO_VALUES_TO_UPDATE,
					},
					apiKey: null,
					user: session.user,
				});
			}

			let newApiKey: ApiKey = apiKey;
			try {
				let result = await ctx.context.adapter.update<ApiKey>({
					model: schema.apikey.modelName,
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
						lastRequest: new Date(),
						remaining: apiKey.remaining === null ? null : apiKey.remaining - 1,
						...newValues,
					},
				});
				if (result) newApiKey = result;
			} catch (error: any) {
				opts.events?.({
					event: "key.update",
					success: false,
					error: {
						code: "database.error",
						message: error?.message,
					},
					user: session.user,
					apiKey: apiKey,
				});
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: error?.message,
				});
			}

			deleteAllExpiredApiKeys(ctx.context);

			opts.events?.({
				event: "key.update",
				success: true,
				error: null,
				user: session.user,
				apiKey: newApiKey,
			});

			let resApiKey: Partial<ApiKey> = newApiKey;
			// biome-ignore lint/performance/noDelete: If we set this to `undefined`, the obj will still contain the `key` property, which looks ugly.
			delete resApiKey["key"];

			return ctx.json(resApiKey);
		},
	);
}
