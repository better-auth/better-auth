import { APIError, getSessionFromCtx } from "../../../api";
import { implEndpoint } from "../../../better-call/server";
import { updateApiKeyDef } from "../shared";
import { ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import type { AuthContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
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
	): void;
}) {
	return implEndpoint(updateApiKeyDef, {}, async (ctx) => {
		const {
			keyId,
			userId,
			name,
			enabled,
			metadata,
			refillAmount,
			refillInterval,
			remaining,
			rateLimitMax,
			rateLimitTimeWindow,
			rateLimitEnabled,
			permissions,
		} = ctx.body;

		const session = await getSessionFromCtx(ctx);
		const authRequired = (ctx.request || ctx.headers) && !userId;

		const user = session?.user ?? (authRequired ? null : { id: userId });
		if (!user?.id) {
			throw new APIError("UNAUTHORIZED", {
				message: ERROR_CODES.UNAUTHORIZED_SESSION,
			});
		}

		// if this endpoint was being called from the client,
		// we must make sure they can't use server-only properties.
		if (authRequired) {
			if (
				refillAmount !== undefined ||
				refillInterval !== undefined ||
				rateLimitMax !== undefined ||
				rateLimitTimeWindow !== undefined ||
				rateLimitEnabled !== undefined ||
				permissions !== undefined ||
				remaining !== undefined
			) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.SERVER_ONLY_PROPERTY,
				});
			}
		}

		const userApiKey = await ctx.context.adapter.findOne<ApiKey>({
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

		if (!userApiKey) {
			throw new APIError("NOT_FOUND", {
				message: ERROR_CODES.KEY_NOT_FOUND,
			});
		}

		deleteAllExpiredApiKeys(ctx.context);

		const updateData: Partial<ApiKey> = {
			updatedAt: new Date(),
		};

		if (name !== undefined) {
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
			updateData.name = name;
		}

		if (enabled !== undefined) {
			updateData.enabled = enabled;
		}

		if (remaining !== undefined) {
			updateData.remaining = remaining;
		}

		if (refillAmount !== undefined && refillInterval !== undefined) {
			updateData.refillAmount = refillAmount;
			updateData.refillInterval = refillInterval;
		} else if (refillAmount || refillInterval) {
			if (refillAmount && !refillInterval) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_AMOUNT_AND_INTERVAL_REQUIRED,
				});
			}
			if (refillInterval && !refillAmount) {
				throw new APIError("BAD_REQUEST", {
					message: ERROR_CODES.REFILL_INTERVAL_AND_AMOUNT_REQUIRED,
				});
			}
		}

		if (rateLimitMax !== undefined) {
			updateData.rateLimitMax = rateLimitMax;
		}

		if (rateLimitTimeWindow !== undefined) {
			updateData.rateLimitTimeWindow = rateLimitTimeWindow;
		}

		if (rateLimitEnabled !== undefined) {
			updateData.rateLimitEnabled = rateLimitEnabled;
		}

		if (permissions) {
			//@ts-expect-error - we intentionally save the permissions as string on DB.
			updateData.permissions = JSON.stringify(permissions);
		}

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
			//@ts-expect-error - we intentionally save the metadata as string on DB.
			updateData.metadata =
				schema.apikey.fields.metadata.transform.input(metadata);
		}

		// check if there's any data to update
		if (Object.keys(updateData).length === 1) {
			// only updatedAt was set
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.NO_VALUES_TO_UPDATE,
			});
		}

		try {
			await ctx.context.adapter.update({
				model: API_KEY_TABLE_NAME,
				where: [
					{
						field: "id",
						value: keyId,
					},
				],
				update: updateData,
			});
		} catch (error) {
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: ERROR_CODES.FAILED_TO_UPDATE_API_KEY,
			});
		}

		return ctx.json({
			success: true,
		});
	});
}
