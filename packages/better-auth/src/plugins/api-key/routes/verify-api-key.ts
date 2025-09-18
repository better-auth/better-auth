import { APIError } from "../../../api";
import { implEndpoint } from "../../../better-call/server";
import { verifyApiKeyDef } from "../shared";
import { API_KEY_TABLE_NAME, ERROR_CODES } from "..";
import type { apiKeySchema } from "../schema";
import type { ApiKey } from "../types";
import { isRateLimited } from "../rate-limit";
import type { AuthContext, GenericEndpointContext } from "../../../types";
import type { PredefinedApiKeyOptions } from ".";
import { safeJSONParse } from "../../../utils/json";
import { defaultKeyHasher } from "../";

export async function validateApiKey({
	hashedKey,
	ctx,
	opts,
	schema,
	permissions,
}: {
	hashedKey: string;
	opts: PredefinedApiKeyOptions;
	schema: ReturnType<typeof apiKeySchema>;
	permissions?: Record<string, string[]>;
	ctx: GenericEndpointContext;
}) {
	const apiKey = await ctx.adapter.findOne<ApiKey>({
		model: API_KEY_TABLE_NAME,
		where: [
			{
				field: "key",
				value: hashedKey,
			},
		],
	});

	if (!apiKey) {
		throw new APIError("FORBIDDEN", {
			message: ERROR_CODES.INVALID_API_KEY,
		});
	}

	if (!apiKey.enabled) {
		throw new APIError("FORBIDDEN", {
			message: ERROR_CODES.KEY_DISABLED,
		});
	}

	// check if expired
	if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
		throw new APIError("FORBIDDEN", {
			message: ERROR_CODES.KEY_EXPIRED,
		});
	}

	// check the permissions
	if (permissions) {
		if (apiKey.permissions) {
			const apiKeyPermissions = safeJSONParse<Record<string, string[]>>(
				apiKey.permissions,
			);
			if (apiKeyPermissions) {
				let hasRequiredPermissions = false;
				for (const resource in permissions) {
					const requiredActions = permissions[resource];
					const apiKeyActions = apiKeyPermissions[resource];
					if (apiKeyActions) {
						hasRequiredPermissions = requiredActions.every((action) =>
							apiKeyActions.includes(action),
						);
						if (hasRequiredPermissions) break;
					}
				}
				if (!hasRequiredPermissions) {
					throw new APIError("FORBIDDEN", {
						message: ERROR_CODES.INVALID_API_KEY,
					});
				}
			}
		} else {
			throw new APIError("FORBIDDEN", {
				message: ERROR_CODES.INVALID_API_KEY,
			});
		}
	}

	// check rate limit
	if (opts.rateLimit.enabled && apiKey.rateLimitEnabled) {
		const isLimited = isRateLimited({
			apiKey,
			rateLimitMax: apiKey.rateLimitMax || opts.rateLimit.maxRequests,
			rateLimitTimeWindow:
				apiKey.rateLimitTimeWindow || opts.rateLimit.timeWindow,
		});

		if (isLimited) {
			throw new APIError("TOO_MANY_REQUESTS", {
				message: ERROR_CODES.RATE_LIMIT_EXCEEDED,
			});
		}
	}

	// update the api key with the last request time and usage count
	let updateData: Partial<ApiKey> = {
		lastRequest: new Date(),
	};

	// Handle remaining count
	if (apiKey.remaining !== null) {
		if (apiKey.remaining <= 0) {
			throw new APIError("FORBIDDEN", {
				message: ERROR_CODES.USAGE_EXCEEDED,
			});
		}
		updateData.remaining = apiKey.remaining - 1;
	}

	// Update request count for rate limiting
	if (opts.rateLimit.enabled && apiKey.rateLimitEnabled) {
		const now = Date.now();
		const timeWindow = apiKey.rateLimitTimeWindow || opts.rateLimit.timeWindow;
		const lastRequestTime = apiKey.lastRequest?.getTime() || 0;

		if (now - lastRequestTime > timeWindow) {
			// Reset the count if the time window has passed
			updateData.requestCount = 1;
		} else {
			// Increment the count within the time window
			updateData.requestCount = (apiKey.requestCount || 0) + 1;
		}
	}

	await ctx.adapter.update({
		model: API_KEY_TABLE_NAME,
		where: [{ field: "id", value: apiKey.id }],
		update: updateData,
	});

	return {
		...apiKey,
		...updateData,
		permissions: apiKey.permissions ? safeJSONParse(apiKey.permissions) : null,
		metadata: schema.apikey.fields.metadata.transform.output(
			apiKey.metadata as never as string,
		),
	};
}

export function verifyApiKey({
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
	return implEndpoint(verifyApiKeyDef, {}, async (ctx) => {
		const { key } = ctx.body;

		if (!key) {
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.INVALID_API_KEY,
			});
		}

		const hashed = opts.disableKeyHashing ? key : await defaultKeyHasher(key);

		deleteAllExpiredApiKeys(ctx.context);

		try {
			const validatedApiKey = await validateApiKey({
				hashedKey: hashed,
				ctx: ctx.context,
				opts,
				schema,
			});

			const user = await ctx.context.internalAdapter.findUserById(
				validatedApiKey.userId,
			);

			if (!user) {
				throw new APIError("UNAUTHORIZED", {
					message: ERROR_CODES.INVALID_USER_ID_FROM_API_KEY,
				});
			}

			return ctx.json({
				valid: true,
				apiKey: {
					...validatedApiKey,
					key: undefined, // Don't return the key in the response
				},
				user: user,
			});
		} catch (error) {
			if (error instanceof APIError) {
				return ctx.json({
					valid: false,
					apiKey: null,
					user: null,
					error: error.message,
				});
			}
			return ctx.json({
				valid: false,
				apiKey: null,
				user: null,
				error: "Invalid API key",
			});
		}
	});
}
