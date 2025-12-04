import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import type { Account, User } from "@better-auth/core/db";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError } from "better-call";
import * as z from "zod";
import { createEmailVerificationToken } from "../../api";
import { setSessionCookie } from "../../cookies";
import { mergeSchema } from "../../db";
import type { InferOptionSchema } from "../../types/plugins";
import { USERNAME_ERROR_CODES as ERROR_CODES } from "./error-codes";
import type { UsernameSchema } from "./schema";
import { getSchema } from "./schema";

export { USERNAME_ERROR_CODES } from "./error-codes";

export type UsernameOptions = {
	schema?: InferOptionSchema<UsernameSchema> | undefined;
	/**
	 * The minimum length of the username
	 *
	 * @default 3
	 */
	minUsernameLength?: number | undefined;
	/**
	 * The maximum length of the username
	 *
	 * @default 30
	 */
	maxUsernameLength?: number | undefined;
	/**
	 * A function to validate the username
	 *
	 * By default, the username should only contain alphanumeric characters and underscores
	 */
	usernameValidator?:
		| ((username: string) => boolean | Promise<boolean>)
		| undefined;
	/**
	 * A function to validate the display username
	 *
	 * By default, no validation is applied to display username
	 */
	displayUsernameValidator?:
		| ((displayUsername: string) => boolean | Promise<boolean>)
		| undefined;
	/**
	 * A function to normalize the username
	 *
	 * @default (username) => username.toLowerCase()
	 */
	usernameNormalization?: (((username: string) => string) | false) | undefined;
	/**
	 * A function to normalize the display username
	 *
	 * @default false
	 */
	displayUsernameNormalization?:
		| (((displayUsername: string) => string) | false)
		| undefined;
	/**
	 * The order of validation
	 *
	 * @default { username: "pre-normalization", displayUsername: "pre-normalization" }
	 */
	validationOrder?:
		| {
				/**
				 * The order of username validation
				 *
				 * @default "pre-normalization"
				 */
				username?: "pre-normalization" | "post-normalization";
				/**
				 * The order of display username validation
				 *
				 * @default "pre-normalization"
				 */
				displayUsername?: "pre-normalization" | "post-normalization";
		  }
		| undefined;
};

function defaultUsernameValidator(username: string) {
	return /^[a-zA-Z0-9_.]+$/.test(username);
}

const signInUsernameBodySchema = z.object({
	username: z.string().meta({ description: "The username of the user" }),
	password: z.string().meta({ description: "The password of the user" }),
	rememberMe: z
		.boolean()
		.meta({
			description: "Remember the user session",
		})
		.optional(),
	callbackURL: z
		.string()
		.meta({
			description: "The URL to redirect to after email verification",
		})
		.optional(),
});

const isUsernameAvailableBodySchema = z.object({
	username: z.string().meta({
		description: "The username to check",
	}),
});

export const username = (options?: UsernameOptions | undefined) => {
	const normalizer = (username: string) => {
		if (options?.usernameNormalization === false) {
			return username;
		}
		if (options?.usernameNormalization) {
			return options.usernameNormalization(username);
		}
		return username.toLowerCase();
	};

	const displayUsernameNormalizer = (displayUsername: string) => {
		return options?.displayUsernameNormalization
			? options.displayUsernameNormalization(displayUsername)
			: displayUsername;
	};

	return {
		id: "username",
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async before(user, context) {
									const username =
										"username" in user ? (user.username as string) : null;
									const displayUsername =
										"displayUsername" in user
											? (user.displayUsername as string)
											: null;

									return {
										data: {
											...user,
											...(username ? { username: normalizer(username) } : {}),
											...(displayUsername
												? {
														displayUsername:
															displayUsernameNormalizer(displayUsername),
													}
												: {}),
										},
									};
								},
							},
							update: {
								async before(user, context) {
									const username =
										"username" in user ? (user.username as string) : null;
									const displayUsername =
										"displayUsername" in user
											? (user.displayUsername as string)
											: null;

									return {
										data: {
											...user,
											...(username ? { username: normalizer(username) } : {}),
											...(displayUsername
												? {
														displayUsername:
															displayUsernameNormalizer(displayUsername),
													}
												: {}),
										},
									};
								},
							},
						},
					},
				},
			};
		},
		endpoints: {
			signInUsername: createAuthEndpoint(
				"/sign-in/username",
				{
					method: "POST",
					body: signInUsernameBodySchema,
					metadata: {
						openapi: {
							summary: "Sign in with username",
							description: "Sign in with username",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													token: {
														type: "string",
														description:
															"Session token for the authenticated session",
													},
													user: {
														$ref: "#/components/schemas/User",
													},
												},
												required: ["token", "user"],
											},
										},
									},
								},
								422: {
									description: "Unprocessable Entity. Validation error",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													message: {
														type: "string",
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
					if (!ctx.body.username || !ctx.body.password) {
						ctx.context.logger.error("Username or password not found");
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
						});
					}

					const username =
						options?.validationOrder?.username === "pre-normalization"
							? normalizer(ctx.body.username)
							: ctx.body.username;

					const minUsernameLength = options?.minUsernameLength || 3;
					const maxUsernameLength = options?.maxUsernameLength || 30;

					if (username.length < minUsernameLength) {
						ctx.context.logger.error("Username too short", {
							username,
						});
						throw new APIError("UNPROCESSABLE_ENTITY", {
							code: "USERNAME_TOO_SHORT",
							message: ERROR_CODES.USERNAME_TOO_SHORT,
						});
					}

					if (username.length > maxUsernameLength) {
						ctx.context.logger.error("Username too long", {
							username,
						});
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: ERROR_CODES.USERNAME_TOO_LONG,
						});
					}

					const validator =
						options?.usernameValidator || defaultUsernameValidator;

					if (!validator(username)) {
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: ERROR_CODES.INVALID_USERNAME,
						});
					}

					const user = await ctx.context.adapter.findOne<
						User & { username: string; displayUsername: string }
					>({
						model: "user",
						where: [
							{
								field: "username",
								value: normalizer(username),
							},
						],
					});
					if (!user) {
						// Hash password to prevent timing attacks from revealing valid usernames
						// By hashing passwords for invalid usernames, we ensure consistent response times
						await ctx.context.password.hash(ctx.body.password);
						ctx.context.logger.error("User not found", {
							username,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
						});
					}

					const account = await ctx.context.adapter.findOne<Account>({
						model: "account",
						where: [
							{
								field: "userId",
								value: user.id,
							},
							{
								field: "providerId",
								value: "credential",
							},
						],
					});
					if (!account) {
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
						});
					}
					const currentPassword = account?.password;
					if (!currentPassword) {
						ctx.context.logger.error("Password not found", {
							username,
						});
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
						});
					}
					const validPassword = await ctx.context.password.verify({
						hash: currentPassword,
						password: ctx.body.password,
					});
					if (!validPassword) {
						ctx.context.logger.error("Invalid password");
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
						});
					}

					if (
						ctx.context.options?.emailAndPassword?.requireEmailVerification &&
						!user.emailVerified
					) {
						if (
							!ctx.context.options?.emailVerification?.sendVerificationEmail
						) {
							throw new APIError("FORBIDDEN", {
								message: ERROR_CODES.EMAIL_NOT_VERIFIED,
							});
						}

						if (ctx.context.options?.emailVerification?.sendOnSignIn) {
							const token = await createEmailVerificationToken(
								ctx.context.secret,
								user.email,
								undefined,
								ctx.context.options.emailVerification?.expiresIn,
							);
							const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${
								ctx.body.callbackURL || "/"
							}`;
							await ctx.context.options.emailVerification.sendVerificationEmail(
								{
									user: user,
									url,
									token,
								},
								ctx.request,
							);
						}

						throw new APIError("FORBIDDEN", {
							message: ERROR_CODES.EMAIL_NOT_VERIFIED,
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx.body.rememberMe === false,
					);
					if (!session) {
						return ctx.json(null, {
							status: 500,
							body: {
								message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
							},
						});
					}
					await setSessionCookie(
						ctx,
						{ session, user },
						ctx.body.rememberMe === false,
					);
					return ctx.json({
						token: session.token,
						user: {
							id: user.id,
							email: user.email,
							emailVerified: user.emailVerified,
							username: user.username,
							displayUsername: user.displayUsername,
							name: user.name,
							image: user.image,
							createdAt: user.createdAt,
							updatedAt: user.updatedAt,
						},
					});
				},
			),
			isUsernameAvailable: createAuthEndpoint(
				"/is-username-available",
				{
					method: "POST",
					body: isUsernameAvailableBodySchema,
				},
				async (ctx) => {
					const username = ctx.body.username;
					if (!username) {
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: ERROR_CODES.INVALID_USERNAME,
						});
					}

					const minUsernameLength = options?.minUsernameLength || 3;
					const maxUsernameLength = options?.maxUsernameLength || 30;

					if (username.length < minUsernameLength) {
						throw new APIError("UNPROCESSABLE_ENTITY", {
							code: "USERNAME_TOO_SHORT",
							message: ERROR_CODES.USERNAME_TOO_SHORT,
						});
					}

					if (username.length > maxUsernameLength) {
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: ERROR_CODES.USERNAME_TOO_LONG,
						});
					}

					const validator =
						options?.usernameValidator || defaultUsernameValidator;

					if (!(await validator(username))) {
						throw new APIError("UNPROCESSABLE_ENTITY", {
							message: ERROR_CODES.INVALID_USERNAME,
						});
					}
					const user = await ctx.context.adapter.findOne<User>({
						model: "user",
						where: [
							{
								field: "username",
								value: normalizer(username),
							},
						],
					});
					if (user) {
						return ctx.json({
							available: false,
						});
					}
					return ctx.json({
						available: true,
					});
				},
			),
		},
		schema: mergeSchema(
			getSchema({
				username: normalizer,
				displayUsername: displayUsernameNormalizer,
			}),
			options?.schema,
		),
		hooks: {
			before: [
				{
					matcher(context) {
						return (
							context.path === "/sign-up/email" ||
							context.path === "/update-user"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						const username =
							typeof ctx.body.username === "string" &&
							options?.validationOrder?.username === "post-normalization"
								? normalizer(ctx.body.username)
								: ctx.body.username;

						if (username !== undefined && typeof username === "string") {
							const minUsernameLength = options?.minUsernameLength || 3;
							const maxUsernameLength = options?.maxUsernameLength || 30;
							if (username.length < minUsernameLength) {
								throw new APIError("BAD_REQUEST", {
									code: "USERNAME_TOO_SHORT",
									message: ERROR_CODES.USERNAME_TOO_SHORT,
								});
							}

							if (username.length > maxUsernameLength) {
								throw new APIError("BAD_REQUEST", {
									message: ERROR_CODES.USERNAME_TOO_LONG,
								});
							}

							const validator =
								options?.usernameValidator || defaultUsernameValidator;

							const valid = await validator(username);
							if (!valid) {
								throw new APIError("BAD_REQUEST", {
									message: ERROR_CODES.INVALID_USERNAME,
								});
							}
							const user = await ctx.context.adapter.findOne<User>({
								model: "user",
								where: [
									{
										field: "username",
										value: username,
									},
								],
							});

							const blockChangeSignUp = ctx.path === "/sign-up/email" && user;
							const blockChangeUpdateUser =
								ctx.path === "/update-user" &&
								user &&
								ctx.context.session &&
								user.id !== ctx.context.session.session.userId;
							if (blockChangeSignUp || blockChangeUpdateUser) {
								throw new APIError("BAD_REQUEST", {
									message: ERROR_CODES.USERNAME_IS_ALREADY_TAKEN,
								});
							}
						}

						const displayUsername =
							typeof ctx.body.displayUsername === "string" &&
							options?.validationOrder?.displayUsername === "post-normalization"
								? displayUsernameNormalizer(ctx.body.displayUsername)
								: ctx.body.displayUsername;

						if (
							displayUsername !== undefined &&
							typeof displayUsername === "string"
						) {
							if (options?.displayUsernameValidator) {
								const valid =
									await options.displayUsernameValidator(displayUsername);
								if (!valid) {
									throw new APIError("BAD_REQUEST", {
										message: ERROR_CODES.INVALID_DISPLAY_USERNAME,
									});
								}
							}
						}
					}),
				},
				{
					matcher(context) {
						return (
							context.path === "/sign-up/email" ||
							context.path === "/update-user"
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						if (ctx.body.username && !ctx.body.displayUsername) {
							ctx.body.displayUsername = ctx.body.username;
						}
						if (ctx.body.displayUsername && !ctx.body.username) {
							ctx.body.username = ctx.body.displayUsername;
						}
					}),
				},
			],
		},
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
