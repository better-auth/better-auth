import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { createEmailVerificationToken } from "./email-verification";
import { setSessionCookie } from "../../cookies";
import { APIError } from "better-call";
import type {
	AdditionalUserFieldsInput,
	BetterAuthOptions,
	User,
} from "../../types";
import { parseUserInput } from "../../db/schema";
import { BASE_ERROR_CODES } from "../../error/codes";
import { isDevelopment } from "../../utils/env";

export const signUpEmail = <O extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/sign-up/email",
		{
			method: "POST",
			body: z.record(z.string(), z.any()),
			metadata: {
				$Infer: {
					body: {} as {
						name: string;
						email: string;
						password: string;
						image?: string;
						callbackURL?: string;
						rememberMe?: boolean;
					} & AdditionalUserFieldsInput<O>,
				},
				openapi: {
					description: "Sign up a user using email and password",
					requestBody: {
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										name: {
											type: "string",
											description: "The name of the user",
										},
										email: {
											type: "string",
											description: "The email of the user",
										},
										password: {
											type: "string",
											description: "The password of the user",
										},
										image: {
											type: "string",
											description: "The profile image URL of the user",
										},
										callbackURL: {
											type: "string",
											description:
												"The URL to use for email verification callback",
										},
										rememberMe: {
											type: "boolean",
											description:
												"If this is false, the session will not be remembered. Default is `true`.",
										},
									},
									required: ["name", "email", "password"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Successfully created user",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											token: {
												type: "string",
												nullable: true,
												description: "Authentication token for the session",
											},
											user: {
												type: "object",
												properties: {
													id: {
														type: "string",
														description: "The unique identifier of the user",
													},
													email: {
														type: "string",
														format: "email",
														description: "The email address of the user",
													},
													name: {
														type: "string",
														description: "The name of the user",
													},
													image: {
														type: "string",
														format: "uri",
														nullable: true,
														description: "The profile image URL of the user",
													},
													emailVerified: {
														type: "boolean",
														description: "Whether the email has been verified",
													},
													createdAt: {
														type: "string",
														format: "date-time",
														description: "When the user was created",
													},
													updatedAt: {
														type: "string",
														format: "date-time",
														description: "When the user was last updated",
													},
												},
												required: [
													"id",
													"email",
													"name",
													"emailVerified",
													"createdAt",
													"updatedAt",
												],
											},
										},
										required: ["user"], // token is optional
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			if (
				!ctx.context.options.emailAndPassword?.enabled ||
				ctx.context.options.emailAndPassword?.disableSignUp
			) {
				throw new APIError("BAD_REQUEST", {
					message: "Email and password sign up is not enabled",
				});
			}
			const body = ctx.body as any as User & {
				password: string;
				callbackURL?: string;
				rememberMe?: boolean;
			} & {
				[key: string]: any;
			};
			const {
				name,
				email,
				password,
				image,
				callbackURL,
				rememberMe,
				...additionalFields
			} = body;
			const isValidEmail = z.string().email().safeParse(email);

			if (!isValidEmail.success) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.INVALID_EMAIL,
				});
			}

			const minPasswordLength = ctx.context.password.config.minPasswordLength;
			if (password.length < minPasswordLength) {
				ctx.context.logger.error("Password is too short");
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
				});
			}

			const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
			if (password.length > maxPasswordLength) {
				ctx.context.logger.error("Password is too long");
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.PASSWORD_TOO_LONG,
				});
			}
			const dbUser = await ctx.context.internalAdapter.findUserByEmail(email);
			if (dbUser?.user) {
				ctx.context.logger.info(`Sign-up attempt for existing email: ${email}`);
				throw new APIError("UNPROCESSABLE_ENTITY", {
					message: BASE_ERROR_CODES.USER_ALREADY_EXISTS,
				});
			}

			const additionalData = parseUserInput(
				ctx.context.options,
				additionalFields as any,
			);
			/**
			 * Hash the password
			 *
			 * This is done prior to creating the user
			 * to ensure that any plugin that
			 * may break the hashing should break
			 * before the user is created.
			 */
			const hash = await ctx.context.password.hash(password);
			let createdUser: User;
			try {
				createdUser = await ctx.context.internalAdapter.createUser(
					{
						email: email.toLowerCase(),
						name,
						image,
						...additionalData,
						emailVerified: false,
					},
					ctx,
				);
				if (!createdUser) {
					throw new APIError("BAD_REQUEST", {
						message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
					});
				}
			} catch (e) {
				if (isDevelopment) {
					ctx.context.logger.error("Failed to create user", e);
				}
				if (e instanceof APIError) {
					throw e;
				}
				throw new APIError("UNPROCESSABLE_ENTITY", {
					message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
					details: e,
				});
			}
			if (!createdUser) {
				throw new APIError("UNPROCESSABLE_ENTITY", {
					message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
				});
			}
			await ctx.context.internalAdapter.linkAccount(
				{
					userId: createdUser.id,
					providerId: "credential",
					accountId: createdUser.id,
					password: hash,
				},
				ctx,
			);
			if (
				ctx.context.options.emailVerification?.sendOnSignUp ||
				ctx.context.options.emailAndPassword.requireEmailVerification
			) {
				const token = await createEmailVerificationToken(
					ctx.context.secret,
					createdUser.email,
					undefined,
					ctx.context.options.emailVerification?.expiresIn,
				);
				const url = `${
					ctx.context.baseURL
				}/verify-email?token=${token}&callbackURL=${body.callbackURL || "/"}`;
				await ctx.context.options.emailVerification?.sendVerificationEmail?.(
					{
						user: createdUser,
						url,
						token,
					},
					ctx.request,
				);
			}

			if (
				ctx.context.options.emailAndPassword.autoSignIn === false ||
				ctx.context.options.emailAndPassword.requireEmailVerification
			) {
				return ctx.json({
					token: null,
					user: {
						id: createdUser.id,
						email: createdUser.email,
						name: createdUser.name,
						image: createdUser.image,
						emailVerified: createdUser.emailVerified,
						createdAt: createdUser.createdAt,
						updatedAt: createdUser.updatedAt,
					},
				});
			}

			const session = await ctx.context.internalAdapter.createSession(
				createdUser.id,
				ctx,
				rememberMe === false,
			);
			if (!session) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
				});
			}
			await setSessionCookie(
				ctx,
				{
					session,
					user: createdUser,
				},
				rememberMe === false,
			);
			return ctx.json({
				token: session.token,
				user: {
					id: createdUser.id,
					email: createdUser.email,
					name: createdUser.name,
					image: createdUser.image,
					emailVerified: createdUser.emailVerified,
					createdAt: createdUser.createdAt,
					updatedAt: createdUser.updatedAt,
				},
			});
		},
	);
