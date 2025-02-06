import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../api";
import { type BetterAuthPlugin } from "../../types";

interface RateLimitAlgorithm_base {
	algo:
		| "token_bucket"
		| "leaky_bucket"
		| "fixed_window_counter"
		| "sliding_window_log"
		| "siding_window_counter";
}

export type RateLimitAlgorithm = RateLimitAlgorithm_base;

export type ApiKeyIdentifier = string | RegExp;

export type ApiKeyOptions = {
	/**
	 * Customize the ApiKey schema
	 */
	schema?: {
		/**
		 * The name of the apiKey table.
		 * @default "apiKey"
		 */
		modelName: string;
	};
	/**
	 * Apply rate-limits based on a given api key `identifier`
	 */
	rateLimits?: Record<string, RateLimitAlgorithm>;
	/**
	 * A list of trusted `identifier`s which allow users to create API keys based on.
	 *
	 * This array supports strings and Regex values.
	 *
	 * @example
	 * ```ts
	 * ["org", /workspace-[a-zA-Z]+/g]
	 * ```
	 */
	valid_identifiers?: ApiKeyIdentifier[];
	/**
	 * Configure the API key generation's default output
	 */
	key_config?: {
		/**
		 * The Default API key length.
		 *
		 * @default {32}
		 */
		default_key_length?: number;
		/**
		 * Whether to include special characters in the API key.
		 *
		 * @default false
		 */
		includeSpecialCharacters?: boolean;
		/**
		 * Whether to include numbers in the API key.
		 *
		 * @default true
		 */
		includeNumbers?: boolean;
	};
};

export type ApiKey = {
	id: string;
	createdAt: Date;
	updatedAt: Date;
	remaining: number;
	key: string;
	identifier: string;
	ownerId: string;
	expires: number | undefined;
	name?: string;
};

const DEFAULT_KEY_LENGTH = 64;

export const ERROR_CODES = {
	FAILED_TO_CREATE_API_KEY: "Failed to create apiKey",
	UNAUTHORIZED_TO_CREATE_API_KEY: "Unauthorized to create apiKey",
	UNAUTHORIZED_TO_VERIFY_API_KEY: "Unauthorized to verify apiKey",
	UNAUTHORIZED_TO_GET_API_KEY: "Unauthorized to get apiKey",
	API_KEY_NOT_FOUND: "ApiKey not found",
	UNAUTHORIZED_TO_UPDATE_API_KEY: "Unauthorized to update apiKey",
	UNAUTHORIZED_TO_DELETE_API_KEY: "Unauthorized to delete apiKey",
	// RATE_LIMIT_EXCEEDED: "Rate limit exceeded",
	// API_KEY_EXPIRED: "ApiKey expired",
};

export const apiKey = (options?: ApiKeyOptions) => {
	const key_config = {
		default_key_length:
			options?.key_config?.default_key_length ?? DEFAULT_KEY_LENGTH,
		includeSpecialCharacters:
			options?.key_config?.includeSpecialCharacters ?? false,
		includeNumbers: options?.key_config?.includeNumbers ?? true,
	};
	function generateApiKey(otps: { prefix?: string; length?: number } = {}) {
		const { prefix, length = key_config.default_key_length } = otps || {};
		let characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
		if (key_config.includeSpecialCharacters) characters += "!@#$%^&*()-_";
		if (key_config.includeNumbers) characters += "0123456789";

		let apiKey = "";
		for (let i = 0; i < length; i++) {
			const randomIndex = Math.floor(Math.random() * characters.length);
			apiKey += characters[randomIndex];
		}
		return prefix ? prefix + "_" + apiKey : apiKey;
	}

	return {
		id: "apiKey",
		$ERROR_CODES: ERROR_CODES,
		endpoints: {
			createApiKey: createAuthEndpoint(
				"/api-key/create",
				{
					method: "POST",
					body: z.object({
						name: z
							.string({
								description: "The name of the apiKey.",
							})
							.optional(),
						identifier: z.string({
							description: "A predetermined identifier for the key.",
						}),
						remaining: z
							.number({
								description: "The number of requests remaining.",
							})
							.optional(),
						prefix: z
							.string({
								description:
									'A prefix to your API Key. For example, the prefix of "xyz" can result the API key to "xyz_blahblahblahblah"',
							})
							.optional(),
						length: z
							.number({
								description: `The length of the API key. Longer is better. Default is ${DEFAULT_KEY_LENGTH}.`,
							})
							.optional(),
						expires: z
							.number({
								description:
									"UNIX timestamp of when the API key expires. When it expires, the key is automatically deleted and becomes invalid.",
							})
							.optional(),
					}),
					metadata: {
						openapi: {
							operationId: "createApiKey",
							summary: "Create an apiKey",
							description: "Create an apiKey",
							responses: {
								200: {
									description: "ApiKey created",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													apiKey: {
														$ref: "#/components/schemas/ApiKey",
													},
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
					const session = await getSessionFromCtx(ctx);

					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_CREATE_API_KEY,
						});
					}

					const newKey = await ctx.context.adapter.create<ApiKey>({
						model: "apiKeys",
						data: {
							createdAt: new Date(),
							updatedAt: new Date(),
							id: ctx.context.generateId({ model: "apiKeys" }),
							remaining: ctx.body.remaining ?? 0,
							key: generateApiKey({
								length: ctx.body.length,
								prefix: ctx.body.prefix,
							}),
							expires: ctx.body.expires,
							identifier: ctx.body.identifier,
							ownerId: session.user.id,
							name: ctx.body.name,
						},
					});

					return ctx.json(newKey);
				},
			),
			verifyApiKey: createAuthEndpoint(
				"/api-key/verify",
				{
					method: "POST",
					body: z.object({
						key: z.string({
							description: "The apiKey to verify",
						}),
					}),
				},
				async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_VERIFY_API_KEY,
						});
					}
					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKeys",
						where: [
							{
								field: "key",
								operator: "eq",
								value: ctx.body.key,
							},
						],
					});
					if (!apiKey) {
						return ctx.json({
							valid: false,
							message: ERROR_CODES.API_KEY_NOT_FOUND,
						});
					}
					if (apiKey.ownerId !== session.user.id) {
						return ctx.json({
							valid: false,
							message: ERROR_CODES.UNAUTHORIZED_TO_VERIFY_API_KEY,
						});
					}

					return ctx.json({
						valid: true,
					});
				},
			),
			getApiKey: createAuthEndpoint(
				"/api-key/get",
				{
					method: "GET",
					query: z.object({
						keyId: z.string({
							description: "The apiKey id",
						}),
					}),
				},
				async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_GET_API_KEY,
						});
					}

					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKeys",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.query.keyId,
							},
						],
					});
					if (!apiKey) {
						throw new APIError("NOT_FOUND", {
							message: ERROR_CODES.API_KEY_NOT_FOUND,
						});
					}
					if (apiKey.ownerId !== session.user.id) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_GET_API_KEY,
						});
					}
					return ctx.json(apiKey);
				},
			),
			updateApiKey: createAuthEndpoint(
				"/api-key/update",
				{
					method: "POST",
					body: z.object({
						keyId: z.string({
							description: "The apiKey id",
						}),
						name: z
							.string({
								description: "The name of the apiKey.",
							})
							.optional(),
						remaining: z
							.number({
								description: "The number of requests remaining.",
							})
							.optional(),
						prefix: z
							.string({
								description:
									'A prefix to your API Key. For example, the prefix of "xyz" can result the API key to "xyz_blahblahblahblah"',
							})
							.optional(),
						length: z
							.number({
								description: `The length of the API key. Longer is better. Default is ${DEFAULT_KEY_LENGTH}.`,
							})
							.optional(),
						expires: z
							.number({
								description:
									"UNIX timestamp of when the API key expires. When it expires, the key is automatically deleted and becomes invalid.",
							})
							.optional(),
					}),
				},
				async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_UPDATE_API_KEY,
						});
					}
					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKeys",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.body.keyId,
							},
						],
					});
					if (!apiKey) {
						throw new APIError("NOT_FOUND", {
							message: ERROR_CODES.API_KEY_NOT_FOUND,
						});
					}
					if (apiKey.ownerId !== session.user.id) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_UPDATE_API_KEY,
						});
					}
					const result = await ctx.context.adapter.update<ApiKey>({
						model: "apiKeys",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.body.keyId,
							},
						],
						update: {
							name: ctx.body.name,
							remaining: ctx.body.remaining,
							prefix: ctx.body.prefix,
							length: ctx.body.length,
							expires: ctx.body.expires,
						},
					});
					return ctx.json(result);
				},
			),
			deleteApiKey: createAuthEndpoint(
				"/api-key/delete",
				{
					method: "POST",
					body: z.object({
						keyId: z.string({
							description: "The apiKey id",
						}),
					}),
				},
				async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_DELETE_API_KEY,
							success: false,
						});
					}
					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKeys",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.body.keyId,
							},
						],
					});
					if (!apiKey) {
						throw new APIError("NOT_FOUND", {
							message: ERROR_CODES.API_KEY_NOT_FOUND,
							success: false,
						});
					}
					if (apiKey.ownerId !== session.user.id) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_DELETE_API_KEY,
							success: false,
						});
					}
					await ctx.context.adapter.delete<ApiKey>({
						model: "apiKeys",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.body.keyId,
							},
						],
					});

					return ctx.json({ success: true });
				},
			),
			listApiKey: createAuthEndpoint(
				"/api-key/list",
				{
					method: "GET",
					query: z.object({
						identifier: z.string({
							description: "The apiKey identifier",
						}),
					}),
				},
				async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_GET_API_KEY,
						});
					}
					const apiKey = await ctx.context.adapter.findMany<ApiKey>({
						model: "apiKeys",
						where: [
							{
								field: "identifier",
								operator: "eq",
								value: ctx.query.identifier,
							},
							{
								field: "ownerId",
								operator: "eq",
								value: session.user.id,
							}
						],
					});
					return ctx.json(apiKey);
				},
			),
		},
		schema: {
			apiKeys: {
				modelName: options?.schema?.modelName || "apiKey",
				fields: {
					createdAt: {
						type: "date",
						input: true,
						defaultValue: () => new Date(),
						required: true,
					},
					updatedAt: {
						type: "date",
						input: true,
						defaultValue: () => new Date(),
						required: true,
					},
					remaining: {
						type: "number",
						input: true,
						defaultValue: 0,
						required: true,
					},
					key: {
						type: "string",
						required: true,
						input: true,
					},
					identifier: {
						type: "string",
						required: true,
						input: true,
					},
					ownerId: {
						type: "string",
						references: {
							model: "user",
							field: "id",
							onDelete: "cascade",
						},
						required: true,
						input: true,
					},
					expires: {
						type: "number",
						required: false,
					},
					name: {
						type: "string",
						required: false,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
