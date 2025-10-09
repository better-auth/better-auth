import { z } from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "@better-auth/core/middleware";
import type { BetterAuthPlugin } from "@better-auth/core";
import { loginAlias as loginAliasSchema, type LoginAlias, AliasType } from "./schema";
import type { LoginAliasPluginOptions } from "./types";
import { APIError } from "better-call";
import { LOGIN_ALIAS_ERROR_CODES } from "./error-codes";
import {
	normalizeAliasValue,
	validateAliasValue,
	createAliasMetadata,
} from "./utils";
import { sessionMiddleware } from "../../api/routes/session";

export * from "./schema";
export * from "./types";
export * from "./error-codes";

/**
 * Login Aliases Plugin
 * 
 * Allows users to have multiple login identifiers (email, username, phone, etc.)
 * all pointing to the same account. This is useful for large applications with
 * multiple identity integrations.
 * 
 * @example
 * ```ts
 * import { betterAuth } from "better-auth"
 * import { loginAlias } from "better-auth/plugins"
 * 
 * export const auth = betterAuth({
 *   plugins: [
 *     loginAlias({
 *       allowedTypes: ['email', 'username', 'phone'],
 *       requireVerification: {
 *         email: true,
 *         phone: true,
 *         username: false
 *       }
 *     })
 *   ]
 * })
 * ```
 */
export const loginAliasPlugin = (
	options?: LoginAliasPluginOptions,
): BetterAuthPlugin => {
	const opts: Required<LoginAliasPluginOptions> = {
		autoCreateAliases: options?.autoCreateAliases ?? true,
		allowMultiplePerType: options?.allowMultiplePerType ?? true,
		allowedTypes: options?.allowedTypes ?? [
			AliasType.EMAIL,
			AliasType.USERNAME,
			AliasType.PHONE,
		],
		requireVerification: {
			[AliasType.EMAIL]: true,
			[AliasType.PHONE]: true,
			[AliasType.USERNAME]: false,
			...options?.requireVerification,
		},
		maxAliasesPerUser: options?.maxAliasesPerUser ?? 10,
		normalizeValue: options?.normalizeValue ?? normalizeAliasValue,
		onAliasAdded: options?.onAliasAdded ?? (() => {}),
		onAliasRemoved: options?.onAliasRemoved ?? (() => {}),
		onAliasVerified: options?.onAliasVerified ?? (() => {}),
	};

	return {
		id: "login-alias",
		schema: {
			loginAlias: loginAliasSchema,
		},
		endpoints: {
			listAliases: createAuthEndpoint(
				"/alias/list",
				{
					method: "GET",
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "List all login aliases for the current user",
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "array",
												items: {
													type: "object",
													properties: {
														id: { type: "string" },
														type: { type: "string" },
														value: { type: "string" },
														verified: { type: "boolean" },
														isPrimary: { type: "boolean" },
														createdAt: { type: "string", format: "date-time" },
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
					const userId = ctx.context.session.user.id;
					const aliases = await ctx.context.adapter.findMany<LoginAlias>({
						model: "loginAlias",
						where: [{ field: "userId", value: userId }],
					});

					return ctx.json(
						aliases.map((alias) => ({
							id: alias.id,
							type: alias.type,
							value: alias.value,
							verified: alias.verified,
							isPrimary: alias.isPrimary,
							createdAt: alias.createdAt,
							metadata: alias.metadata,
						})),
					);
				},
			),
			addAlias: createAuthEndpoint(
				"/alias/add",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: z.object({
						type: z.string(),
						value: z.string(),
						verified: z.boolean().optional(),
						isPrimary: z.boolean().optional(),
						metadata: z.record(z.string(), z.any()).optional(),
					}),
					metadata: {
						openapi: {
							description: "Add a new login alias to the current user",
							responses: {
								"200": {
									description: "Alias added successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													id: { type: "string" },
													type: { type: "string" },
													value: { type: "string" },
													verified: { type: "boolean" },
													isPrimary: { type: "boolean" },
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
					const userId = ctx.context.session.user.id;
					const { type, value, verified, isPrimary, metadata } = ctx.body;

					// Validate alias type
					if (!opts.allowedTypes.includes(type)) {
						throw new APIError("BAD_REQUEST", {
							message: LOGIN_ALIAS_ERROR_CODES.ALIAS_TYPE_NOT_ALLOWED,
						});
					}

					// Validate alias value
					if (!validateAliasValue(value, type)) {
						throw new APIError("BAD_REQUEST", {
							message: LOGIN_ALIAS_ERROR_CODES.INVALID_ALIAS_VALUE,
						});
					}

					// Normalize the value
					const normalizedValue = opts.normalizeValue(value, type);

					// Check if alias already exists
					const existingAlias = await ctx.context.adapter.findOne<LoginAlias>({
						model: "loginAlias",
						where: [{ field: "value", value: normalizedValue }],
					});

					if (existingAlias) {
						throw new APIError("BAD_REQUEST", {
							message: LOGIN_ALIAS_ERROR_CODES.ALIAS_ALREADY_EXISTS,
						});
					}

					// Check max aliases per user
					const userAliases = await ctx.context.adapter.findMany<LoginAlias>({
						model: "loginAlias",
						where: [{ field: "userId", value: userId }],
					});

					if (userAliases.length >= opts.maxAliasesPerUser) {
						throw new APIError("BAD_REQUEST", {
							message: LOGIN_ALIAS_ERROR_CODES.MAX_ALIASES_REACHED,
						});
					}

					// Check if multiple aliases of the same type are allowed
					if (!opts.allowMultiplePerType) {
						const existingTypeAlias = userAliases.find((a) => a.type === type);
						if (existingTypeAlias) {
							throw new APIError("BAD_REQUEST", {
								message: `Only one ${type} alias is allowed per user`,
							});
						}
					}

					// If making this primary, unset other primary aliases of the same type
					if (isPrimary) {
						const primaryAliases = userAliases.filter(
							(a) => a.type === type && a.isPrimary,
						);
						for (const alias of primaryAliases) {
							await ctx.context.adapter.update({
								model: "loginAlias",
								where: [{ field: "id", value: alias.id }],
								update: { isPrimary: false, updatedAt: new Date() },
							});
						}
					}

					// Create metadata if original value differs from normalized
					let metadataString: string | undefined;
					if (metadata) {
						metadataString = createAliasMetadata({
							displayValue: value !== normalizedValue ? value : undefined,
							...metadata,
						});
					} else if (value !== normalizedValue) {
						metadataString = createAliasMetadata({ displayValue: value });
					}

					// Check if verification is required
					const isVerified =
						verified !== undefined ? verified : !(opts.requireVerification[type] ?? false);

					// Create the alias
					const newAlias = await ctx.context.adapter.create<LoginAlias>({
						model: "loginAlias",
						data: {
							userId,
							type,
							value: normalizedValue,
							verified: isVerified,
							isPrimary: isPrimary ?? false,
							metadata: metadataString,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});

					await opts.onAliasAdded(newAlias, userId);

					return ctx.json({
						id: newAlias.id,
						type: newAlias.type,
						value: newAlias.value,
						verified: newAlias.verified,
						isPrimary: newAlias.isPrimary,
						metadata: newAlias.metadata,
					});
				},
			),
			removeAlias: createAuthEndpoint(
				"/alias/remove",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: z.object({
						aliasId: z.string(),
					}),
					metadata: {
						openapi: {
							description: "Remove a login alias",
							responses: {
								"200": {
									description: "Alias removed successfully",
								},
							},
						},
					},
				},
				async (ctx) => {
					const userId = ctx.context.session.user.id;
					const { aliasId } = ctx.body;

					// Find the alias
					const alias = await ctx.context.adapter.findOne<LoginAlias>({
						model: "loginAlias",
						where: [{ field: "id", value: aliasId }],
					});

					if (!alias) {
						throw new APIError("NOT_FOUND", {
							message: LOGIN_ALIAS_ERROR_CODES.ALIAS_NOT_FOUND,
						});
					}

					// Verify ownership
					if (alias.userId !== userId) {
						throw new APIError("UNAUTHORIZED", {
							message: "You don't have permission to remove this alias",
						});
					}

					// Check if this is the last alias
					const userAliases = await ctx.context.adapter.findMany<LoginAlias>({
						model: "loginAlias",
						where: [{ field: "userId", value: userId }],
					});

					// Also check if user has password in account table
					const accounts = await ctx.context.internalAdapter.findAccounts(
						userId,
					);
					const hasPassword = accounts.some((a) => a.providerId === "credential");

					if (userAliases.length === 1 && !hasPassword) {
						throw new APIError("BAD_REQUEST", {
							message: LOGIN_ALIAS_ERROR_CODES.CANNOT_REMOVE_LAST_ALIAS,
						});
					}

					// If removing a primary alias, make another alias of the same type primary
					if (alias.isPrimary) {
						const sameTypeAliases = userAliases.filter(
							(a) => a.type === alias.type && a.id !== aliasId,
						);
						if (sameTypeAliases.length > 0) {
							const newPrimary = sameTypeAliases[0]!;
							await ctx.context.adapter.update({
								model: "loginAlias",
								where: [{ field: "id", value: newPrimary.id }],
								update: { isPrimary: true, updatedAt: new Date() },
							});
						}
					}

					// Delete the alias
					await ctx.context.adapter.delete({
						model: "loginAlias",
						where: [{ field: "id", value: aliasId }],
					});

					await opts.onAliasRemoved(alias, userId);

					return ctx.json({ success: true });
				},
			),
			makePrimaryAlias: createAuthEndpoint(
				"/alias/make-primary",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: z.object({
						aliasId: z.string(),
					}),
					metadata: {
						openapi: {
							description: "Make an alias the primary for its type",
							responses: {
								"200": {
									description: "Alias set as primary",
								},
							},
						},
					},
				},
				async (ctx) => {
					const userId = ctx.context.session.user.id;
					const { aliasId } = ctx.body;

					// Find the alias
					const alias = await ctx.context.adapter.findOne<LoginAlias>({
						model: "loginAlias",
						where: [{ field: "id", value: aliasId }],
					});

					if (!alias) {
						throw new APIError("NOT_FOUND", {
							message: LOGIN_ALIAS_ERROR_CODES.ALIAS_NOT_FOUND,
						});
					}

					// Verify ownership
					if (alias.userId !== userId) {
						throw new APIError("UNAUTHORIZED", {
							message: "You don't have permission to modify this alias",
						});
					}

					// Unset other primary aliases of the same type
					const userAliases = await ctx.context.adapter.findMany<LoginAlias>({
						model: "loginAlias",
						where: [{ field: "userId", value: userId }],
					});

					const primaryAliases = userAliases.filter(
						(a) => a.type === alias.type && a.isPrimary && a.id !== aliasId,
					);

					for (const primaryAlias of primaryAliases) {
						await ctx.context.adapter.update({
							model: "loginAlias",
							where: [{ field: "id", value: primaryAlias.id }],
							update: { isPrimary: false, updatedAt: new Date() },
						});
					}

					// Set this alias as primary
					await ctx.context.adapter.update({
						model: "loginAlias",
						where: [{ field: "id", value: aliasId }],
						update: { isPrimary: true, updatedAt: new Date() },
					});

					return ctx.json({ success: true });
				},
			),
			verifyAlias: createAuthEndpoint(
				"/alias/verify",
				{
					method: "POST",
					use: [sessionMiddleware],
					body: z.object({
						aliasId: z.string(),
					}),
					metadata: {
						openapi: {
							description: "Mark an alias as verified",
							responses: {
								"200": {
									description: "Alias verified",
								},
							},
						},
					},
				},
				async (ctx) => {
					const userId = ctx.context.session.user.id;
					const { aliasId } = ctx.body;

					// Find the alias
					const alias = await ctx.context.adapter.findOne<LoginAlias>({
						model: "loginAlias",
						where: [{ field: "id", value: aliasId }],
					});

					if (!alias) {
						throw new APIError("NOT_FOUND", {
							message: LOGIN_ALIAS_ERROR_CODES.ALIAS_NOT_FOUND,
						});
					}

					// Verify ownership
					if (alias.userId !== userId) {
						throw new APIError("UNAUTHORIZED", {
							message: "You don't have permission to verify this alias",
						});
					}

					// Mark as verified
					await ctx.context.adapter.update({
						model: "loginAlias",
						where: [{ field: "id", value: aliasId }],
						update: { verified: true, updatedAt: new Date() },
					});

					const updatedAlias = { ...alias, verified: true };
					await opts.onAliasVerified(updatedAlias, userId);

					return ctx.json({ success: true });
				},
			),
			findUserByAlias: createAuthEndpoint(
				"/alias/find-user",
				{
					method: "POST",
					requireHeaders: false,
					body: z.object({
						value: z.string(),
						type: z.string().optional(),
					}),
					metadata: {
						openapi: {
							description:
								"Find a user by alias value (internal use, typically for sign-in)",
							responses: {
								"200": {
									description: "User found",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													userId: { type: "string" },
													verified: { type: "boolean" },
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
					const { value, type } = ctx.body;

					// Normalize the value based on type if provided
					const normalizedValue = type
						? opts.normalizeValue(value, type)
						: value.toLowerCase().trim();

					// Find the alias
					let alias: LoginAlias | null;
					if (type) {
						alias = await ctx.context.adapter.findOne<LoginAlias>({
							model: "loginAlias",
							where: [
								{ field: "value", value: normalizedValue },
								{ field: "type", value: type },
							],
						});
					} else {
						alias = await ctx.context.adapter.findOne<LoginAlias>({
							model: "loginAlias",
							where: [{ field: "value", value: normalizedValue }],
						});
					}

					if (!alias) {
						throw new APIError("NOT_FOUND", {
							message: "User not found",
						});
					}

					return ctx.json({
						userId: alias.userId,
						verified: alias.verified,
						type: alias.type,
					});
				},
			),
		},
		hooks: {
			before: [
				{
					matcher(context) {
						return context.path === "/sign-in/email";
					},
					handler: createAuthMiddleware(async (ctx) => {
						// This hook allows sign-in with aliases by checking if the
						// provided identifier is an alias and updating the context
						// with the actual user email
						const body = ctx.body as any;
						if (!body?.email) return;

						try {
							// Check if this is an alias
							const normalizedValue = body.email.toLowerCase().trim();
							const alias = await ctx.context.adapter.findOne<LoginAlias>({
								model: "loginAlias",
								where: [{ field: "value", value: normalizedValue }],
							});

							if (alias) {
								// Get the user to find their actual email
								const user = await ctx.context.adapter.findOne({
									model: "user",
									where: [{ field: "id", value: alias.userId }],
								});

								if (user && (user as any).email) {
									// Replace the alias with the actual user email
									// so the sign-in proceeds normally
									body.email = (user as any).email;
								}
							}
						} catch (error) {
							// If alias lookup fails, continue with normal sign-in
							ctx.context.logger.error("Error checking alias on sign-in", error);
						}
					}),
				},
			],
			after: [
				{
					matcher(context) {
						return (
							opts.autoCreateAliases &&
							(context.path === "/sign-up/email" ||
								context.path === "/sign-in/email" ||
								context.path === "/callback")
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (!ctx.context.returned) return;

						const returned = ctx.context.returned as any;
						const userId = returned.user?.id;

						if (!userId) return;

						const user = returned.user;

						// Auto-create alias for email if it exists and is not already an alias
						if (user.email) {
							const normalizedEmail = opts.normalizeValue(
								user.email,
								AliasType.EMAIL,
							);
							const existingAlias =
								await ctx.context.adapter.findOne<LoginAlias>({
									model: "loginAlias",
									where: [
										{ field: "value", value: normalizedEmail },
										{ field: "userId", value: userId },
									],
								});

							if (!existingAlias) {
								try {
									await ctx.context.adapter.create<LoginAlias>({
										model: "loginAlias",
										data: {
											userId,
											type: AliasType.EMAIL,
											value: normalizedEmail,
											verified: user.emailVerified ?? false,
											isPrimary: true,
											createdAt: new Date(),
											updatedAt: new Date(),
										},
									});
								} catch (error) {
									// Ignore if alias creation fails (e.g., duplicate)
									ctx.context.logger.error(
										"Failed to auto-create email alias",
										error,
									);
								}
							}
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};

/**
 * Login Alias Plugin
 * Export as named export
 */
export { loginAliasPlugin as loginAlias };

