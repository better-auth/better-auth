import { z } from "zod";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "../../api";
import {
	type AuthContext,
	type BetterAuthPlugin,
	type Session,
	type User,
} from "../../types";
import { updateRateLimit } from "./rate-limit";

export type RateLimitConfiguration = {
	/**
	 * Whether to enable rate limit or not.
	 */
	enabled: boolean;
	/**
	 * The time window in milliseconds
	 *
	 * @default 60000 (1 minute)
	 */
	timeWindow: number;
	/**
	 * The maximum number of requests allowed in the time window
	 *
	 * @default 60
	 */
	limit: number;
};

interface VerifyAction_base {
	action: "list" | "create" | "update" | "revoke" | "get" | "reroll";
	session: Session;
	user: User;
	headers: Headers | undefined;
}

interface VerifyAction_list extends VerifyAction_base {
	action: "list";
	apiKey: ApiKey[];
}

interface VerifyAction_create extends VerifyAction_base {
	action: "create";
}

interface VerifyAction_update extends VerifyAction_base {
	action: "update";
	apiKey: ApiKey;
}

interface VerifyAction_revoke extends VerifyAction_base {
	action: "revoke";
	apiKey: ApiKey;
}

interface VerifyAction_get extends VerifyAction_base {
	action: "get";
	apiKey: ApiKey;
}

interface VerifyAction_reroll extends VerifyAction_base {
	action: "reroll";
	apiKey: ApiKey;
}

export type VerifyAction =
	| VerifyAction_list
	| VerifyAction_create
	| VerifyAction_update
	| VerifyAction_revoke
	| VerifyAction_get
	| VerifyAction_reroll;

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
	 * Apply default rate limit coonfigurations
	 */
	rateLimitConfig?: RateLimitConfiguration;
	/**
	 * Configure the API key generation's default output
	 */
	keyConfig?: {
		/**
		 * The Default API key length.
		 *
		 * @default {32}
		 */
		defaultKeyLength?: number;
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
	/**
	 * This function will be called any time an action is performed to validate the user is able to perform the action.
	 *
	 * We will provide the nessesary information, including the key reference, which you can then use to determine if the user's session is valid against the reference.
	 *
	 * @example
	 * ```ts
	 *	async verifyAction({ user, headers, action, apiKey, session }) {
	 *		if (apiKey.reference.startsWith("org-keys:")) {
	 *			// reference for org keys would be: `org-keys:<org-slug>:<org-id>:<user-id>`
	 *			const [, orgSlug, orgId, userId] = apiKey.reference.split(":");
	 *				const org = await auth.api.getFullOrganization({
	 *					query: { organizationId: orgId, organizationSlug: orgSlug },
	 *					headers,
	 *				});
	 *				if (!org) return false;
	 *				const hasUser = org.members.find((x) => x.userId === userId);
	 *				if (!hasUser) return false;
	 *				return true;
	 *			} else {
	 *				return apiKey.reference === user.id;
	 *			}
	 *		},
	 */
	verifyAction: (props: VerifyAction) => Promise<boolean> | boolean;
};

export type ApiKey = {
	id: string;
	createdAt: Date;
	updatedAt: Date;
	lastVerifiedAt: Date | null;
	key: string;
	name: string | undefined;
	reference: string;
	createdBy: string | null;
	remaining: number | null;
	expires: number | undefined;
	enabled: boolean;
	rateLimitEnabled: boolean;
	rateLimitTimeWindow: number;
	rateLimitLimit: number;
	requestCount: number;
	lastRequest: Date;
};

const DEFAULT_KEY_LENGTH = 64;
const DEFAULT_RATE_LIMIT_TIME_WINDOW = 60 * 1000;
const DEFAULT_RATE_LIMIT_LIMIT = 60;

export const ERROR_CODES = {
	FAILED_TO_CREATE_API_KEY: "Failed to create key",
	UNAUTHORIZED_TO_CREATE_API_KEY: "Unauthorized to create key",
	UNAUTHORIZED_TO_VERIFY_API_KEY: "Unauthorized to verify key",
	UNAUTHORIZED_TO_GET_API_KEY: "Unauthorized to get key",
	API_KEY_NOT_FOUND: "API key not found",
	UNAUTHORIZED_TO_UPDATE_API_KEY: "Unauthorized to update API key",
	UNAUTHORIZED_TO_DELETE_API_KEY: "Unauthorized to delete API key",
	API_KEY_DISABLED: "ApiKey is disabled",
	UNAUTHORIZED_TO_REROLL_API_KEY: "Unauthorized to reroll key",
	UNAUTHORIZED_TO_REVOKE_API_KEY: "Unauthorized to revoke key",
	UNAUTHORIZED_TO_LIST_API_KEYS: "Unauthorized to list API keys",
	RATE_LIMIT_EXCEEDED: "Rate limit exceeded",
};

export const apiKey = (options: ApiKeyOptions) => {
	const key_config = {
		defaultKeyLength:
			options?.keyConfig?.defaultKeyLength ?? DEFAULT_KEY_LENGTH,
		includeSpecialCharacters:
			options?.keyConfig?.includeSpecialCharacters ?? false,
		includeNumbers: options?.keyConfig?.includeNumbers ?? true,
	};
	function generateApiKey(otps: { prefix?: string; length?: number } = {}) {
		const { prefix, length = key_config.defaultKeyLength } = otps || {};
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

	const model_name = options.schema?.modelName ?? "apiKey";

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
						reference: z.string({
							description: "A reference identifier for the key.",
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
						enabled: z
							.boolean({
								description: "Whether the apiKey is enabled or not.",
							})
							.optional(),
						rateLimit: z
							.object({
								enabled: z
									.boolean({
										description: "Whether to enable rate limit or not.",
									})
									.optional(),
								timeWindow: z
									.number({
										description: "The time window in milliseconds",
									})
									.optional(),
								limit: z
									.number({
										description:
											"The maximum number of requests allowed in the time window",
									})
									.optional(),
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
					deleteAllExpiredApiKeys(ctx.context);
					const session = await getSessionFromCtx(ctx);

					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_CREATE_API_KEY,
						});
					}

					const isValid = await options.verifyAction({
						user: session.user,
						action: "create",
						headers: ctx.headers,
						session: session.session,
					});
					if (!isValid)
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_CREATE_API_KEY,
						});

					const newKey = await ctx.context.adapter.create<ApiKey>({
						model: model_name,
						data: {
							createdAt: new Date(),
							updatedAt: new Date(),
							id: ctx.context.generateId({ model: model_name }),
							remaining: ctx.body.remaining || null,
							key: generateApiKey({
								length: ctx.body.length,
								prefix: ctx.body.prefix,
							}),
							expires: ctx.body.expires,
							reference: ctx.body.reference,
							createdBy: session.user.id,
							name: ctx.body.name,
							enabled: ctx.body.enabled ?? true,
							lastVerifiedAt: null,
							rateLimitEnabled: ctx.body.rateLimit?.enabled ?? true,
							rateLimitTimeWindow:
								ctx.body.rateLimit?.timeWindow ??
								DEFAULT_RATE_LIMIT_TIME_WINDOW,
							rateLimitLimit:
								ctx.body.rateLimit?.limit ?? DEFAULT_RATE_LIMIT_LIMIT,
							requestCount: 1,
							lastRequest: new Date(),
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
					deleteAllExpiredApiKeys(ctx.context);

					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKey",
						where: [
							{
								field: "key",
								operator: "eq",
								value: ctx.body.key,
							},
						],
					});

					if (!apiKey || apiKey.enabled === false) {
						return ctx.json({
							valid: false,
						});
					}

					if (apiKey.expires && apiKey.expires < new Date().getTime()) {
						ctx.context.adapter.delete<ApiKey>({
							model: "apiKey",
							where: [
								{
									field: "id",
									operator: "eq",
									value: apiKey.id,
								},
							],
						});

						return ctx.json({
							valid: false,
						});
					}

					const { message, success } = await updateRateLimit(
						ctx.context.adapter,
						model_name,
						apiKey,
						[
							{
								field: "id",
								operator: "eq",
								value: apiKey.id,
							},
						],
					);
					if (!success) throw new APIError("UNAUTHORIZED", { message });

					if (apiKey.remaining !== null) {
						if (apiKey.remaining - 1 === 0) {
							ctx.context.adapter.delete<ApiKey>({
								model: model_name,
								where: [
									{
										field: "id",
										operator: "eq",
										value: apiKey.id,
									},
								],
							});
						} else {
							ctx.context.adapter.update<ApiKey>({
								model: model_name,
								where: [
									{
										field: "id",
										operator: "eq",
										value: apiKey.id,
									},
								],
								update: {
									remaining: apiKey.remaining - 1,
									lastVerifiedAt: new Date(),
								},
							});
						}
					} else {
						ctx.context.adapter.update<ApiKey>({
							model: model_name,
							where: [
								{
									field: "id",
									operator: "eq",
									value: apiKey.id,
								},
							],
							update: {
								lastVerifiedAt: new Date(),
							},
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
					ctx.headers;
					deleteAllExpiredApiKeys(ctx.context);
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_GET_API_KEY,
						});
					}

					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKey",
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

					const { message, success } = await updateRateLimit(
						ctx.context.adapter,
						model_name,
						apiKey,
						[
							{
								field: "id",
								operator: "eq",
								value: apiKey.id,
							},
						],
					);
					if (!success) throw new APIError("UNAUTHORIZED", { message });

					const isValid = await options.verifyAction({
						user: session.user,
						action: "get",
						apiKey,
						headers: ctx.headers,
						session: session.session,
					});

					if (!isValid)
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_GET_API_KEY,
						});

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
						expires: z
							.number({
								description:
									"UNIX timestamp of when the API key expires. When it expires, the key is automatically deleted and becomes invalid.",
							})
							.optional(),
						enabled: z
							.boolean({
								description: "Whether the apiKey is enabled or not.",
							})
							.optional(),
					}),
				},
				async (ctx) => {
					deleteAllExpiredApiKeys(ctx.context);
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_UPDATE_API_KEY,
						});
					}
					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKey",
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

					const { message, success } = await updateRateLimit(
						ctx.context.adapter,
						model_name,
						apiKey,
						[
							{
								field: "id",
								operator: "eq",
								value: apiKey.id,
							},
						],
					);

					const isValid = await options.verifyAction({
						user: session.user,
						action: "update",
						apiKey,
						headers: ctx.headers,
						session: session.session,
					});

					if (!isValid)
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_UPDATE_API_KEY,
						});

					const result = await ctx.context.adapter.update<ApiKey>({
						model: "apiKey",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.body.keyId,
							},
						],
						update: {
							name: ctx.body.name,
							remaining: ctx.body.remaining ?? null,
							expires: ctx.body.expires,
							enabled: ctx.body.enabled,
							updatedAt: new Date(),
						} satisfies Partial<ApiKey>,
					});
					return ctx.json(result);
				},
			),
			forceUpdateApiKey: createAuthEndpoint(
				"/api-key/force-update",
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
						expires: z
							.number({
								description:
									"UNIX timestamp of when the API key expires. When it expires, the key is automatically deleted and becomes invalid.",
							})
							.optional(),
						enabled: z
							.boolean({
								description: "Whether the apiKey is enabled or not.",
							})
							.optional(),
					}),
				},
				async (ctx) => {
					deleteAllExpiredApiKeys(ctx.context);

					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKey",
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

					const result = await ctx.context.adapter.update<ApiKey>({
						model: "apiKey",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.body.keyId,
							},
						],
						update: {
							name: ctx.body.name,
							remaining: ctx.body.remaining ?? null,
							expires: ctx.body.expires,
							enabled: ctx.body.enabled,
							updatedAt: new Date(),
						} satisfies Partial<ApiKey>,
					});
					return ctx.json(result);
				},
			),
			rerollApiKey: createAuthEndpoint(
				"/api-key/reroll",
				{
					method: "POST",
					body: z.object({
						keyId: z.string({
							description: "The apiKey id",
						}),
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
					}),
				},
				async (ctx) => {
					deleteAllExpiredApiKeys(ctx.context);
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_UPDATE_API_KEY,
						});
					}
					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKey",
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
					const { message, success } = await updateRateLimit(
						ctx.context.adapter,
						model_name,
						apiKey,
						[
							{
								field: "id",
								operator: "eq",
								value: apiKey.id,
							},
						],
					);
					if (!success) throw new APIError("UNAUTHORIZED", { message });

					const isValid = await options.verifyAction({
						user: session.user,
						action: "reroll",
						apiKey,
						headers: ctx.headers,
						session: session.session,
					});

					if (!isValid)
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_REROLL_API_KEY,
						});

					const new_key = generateApiKey({
						length: ctx.body.length,
						prefix: ctx.body.prefix,
					});
					await ctx.context.adapter.update<ApiKey>({
						model: "apiKey",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.body.keyId,
							},
						],
						update: {
							key: new_key,
						},
					});
					return ctx.json({ key: new_key });
				},
			),
			forceRerollApiKey: createAuthEndpoint(
				"/api-key/force-reroll",

				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
					},
					body: z.object({
						keyId: z.string({
							description: "The apiKey id",
						}),
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
					}),
				},
				async (ctx) => {
					deleteAllExpiredApiKeys(ctx.context);

					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKey",
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

					const new_key = generateApiKey({
						length: ctx.body.length,
						prefix: ctx.body.prefix,
					});
					await ctx.context.adapter.update<ApiKey>({
						model: "apiKey",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.body.keyId,
							},
						],
						update: {
							key: new_key,
						},
					});
					return ctx.json({ key: new_key });
				},
			),
			revokeApiKey: createAuthEndpoint(
				"/api-key/revoke",
				{
					method: "POST",
					body: z.object({
						keyId: z.string({
							description: "The apiKey id",
						}),
					}),
				},
				async (ctx) => {
					deleteAllExpiredApiKeys(ctx.context);
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_DELETE_API_KEY,
							success: false,
						});
					}
					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKey",
						where: [
							{
								field: "id",
								operator: "eq",
								value: ctx.body.keyId,
							},
						],
					});
					if (!apiKey) {
						return ctx.json({
							success: false,
						});
					}

					const { message, success } = await updateRateLimit(
						ctx.context.adapter,
						model_name,
						apiKey,
						[
							{
								field: "id",
								operator: "eq",
								value: apiKey.id,
							},
						],
					);
					if (!success) throw new APIError("UNAUTHORIZED", { message });

					const isValid = await options.verifyAction({
						user: session.user,
						action: "revoke",
						apiKey,
						headers: ctx.headers,
						session: session.session,
					});

					if (!isValid)
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_REVOKE_API_KEY,
						});

					await ctx.context.adapter.delete<ApiKey>({
						model: "apiKey",
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
			forceRevokeApiKey: createAuthEndpoint(
				"/api-key/force-revoke",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
					},
					body: z.object({
						keyId: z.string({
							description: "The apiKey id",
						}),
					}),
				},
				async (ctx) => {
					deleteAllExpiredApiKeys(ctx.context);

					const apiKey = await ctx.context.adapter.findOne<ApiKey>({
						model: "apiKey",
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

					await ctx.context.adapter.delete<ApiKey>({
						model: "apiKey",
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
						reference: z.string({
							description: "The apiKey reference",
						}),
					}),
				},
				async (ctx) => {
					deleteAllExpiredApiKeys(ctx.context);
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.UNAUTHORIZED_TO_GET_API_KEY,
						});
					}
					const apiKeys = await ctx.context.adapter.findMany<ApiKey>({
						model: "apiKey",
						where: [
							{
								field: "reference",
								operator: "eq",
								value: ctx.query.reference,
							},
						],
					});

					const newApiKeys: {
						success: boolean;
						message: string | null;
						apiKey: ApiKey | null;
					}[] = [];

					for (const apiKey of apiKeys) {
						const { message, success } = await updateRateLimit(
							ctx.context.adapter,
							model_name,
							apiKey,
							[
								{
									field: "id",
									operator: "eq",
									value: apiKey.id,
								},
							],
						);
						if (!success) {
							newApiKeys.push({
								success: false,
								message: message,
								apiKey: null,
							});
						} else {
							newApiKeys.push({
								success: true,
								message: null,
								apiKey: apiKey,
							});
						}
					}

					const isValid = await options.verifyAction({
						user: session.user,
						action: "list",
						apiKey: newApiKeys.map(x => x.apiKey).filter(x => x !== null),
						headers: ctx.headers,
						session: session.session,
					});
					if (!isValid) throw new APIError("UNAUTHORIZED");

					return ctx.json(newApiKeys);
				},
			),
			deleteAllExpiredApiKeys: createAuthEndpoint(
				"/api-key/delete-all-expired",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
					},
				},
				async (ctx) => {
					await deleteAllExpiredApiKeys(ctx.context, true);
					return ctx.json({ success: true });
				},
			),
		},
		schema: {
			apiKey: {
				modelName: model_name,
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
						required: false,
						input: true,
						defaultValue: null,
					},
					key: {
						type: "string",
						required: true,
						input: true,
					},
					createdBy: {
						type: "string",
						references: {
							model: "user",
							field: "id",
							onDelete: "cascade",
						},
						required: false,
						input: true,
					},
					reference: {
						type: "string",
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
					enabled: {
						type: "boolean",
						required: false,
						input: true,
						defaultValue: true,
					},
					lastVerifiedAt: {
						type: "date",
						required: false,
						input: true,
					},
					rateLimitEnabled: {
						type: "boolean",
						required: true,
						input: true,
						defaultValue: true,
					},
					rateLimitTimeWindow: {
						type: "number",
						required: false,
						input: true,
						defaultValue: DEFAULT_RATE_LIMIT_TIME_WINDOW,
					},
					rateLimitLimit: {
						type: "number",
						required: false,
						input: true,
						defaultValue: DEFAULT_RATE_LIMIT_LIMIT,
					},
					requestCount: {
						type: "number",
						required: true,
						input: true,
						defaultValue: 1,
					},
					lastRequest: {
						type: "date",
						required: true,
						input: true,
						defaultValue: new Date(),
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};

let lastChecked: Date | null = null;

function deleteAllExpiredApiKeys(
	ctx: AuthContext,
	byPassLastCheckTime = false,
) {
	if (lastChecked && !byPassLastCheckTime) {
		const now = new Date();
		const diff = now.getTime() - lastChecked.getTime();
		if (diff < 10000) {
			return;
		}
	}
	lastChecked = new Date();
	try {
		return ctx.adapter.deleteMany({
			model: "apiKey",
			where: [
				{
					field: "expires",
					operator: "lt",
					value: new Date().getTime(),
				},
			],
		});
	} catch (error) {
		ctx.logger.error(`Failed to delete expired API keys:`, error);
	}
}
