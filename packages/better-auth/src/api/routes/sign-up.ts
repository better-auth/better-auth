import type { BetterAuthOptions } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { runWithTransaction } from "@better-auth/core/context";
import { isDevelopment } from "@better-auth/core/env";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod";
import { setSessionCookie } from "../../cookies";
import { parseUserInput } from "../../db";
import { parseUserOutput } from "../../db/schema";
import type { AdditionalUserFieldsInput, InferUser, User } from "../../types";
import { isAPIError } from "../../utils/is-api-error";
import { formCsrfMiddleware } from "../middlewares/origin-check";
import { createEmailVerificationToken } from "./email-verification";

const _signUpEmailBodySchema = z
	.object({
		name: z.string().nonempty(),
		email: z.email(),
		password: z.string().nonempty(),
		image: z.string().optional(),
		callbackURL: z.string().optional(),
		rememberMe: z.boolean().optional(),
	})
	.and(z.record(z.string(), z.any()));

export const signUpEmail = <O extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/sign-up/email",
		{
			method: "POST",
			operationId: "signUpWithEmailAndPassword",
			use: [formCsrfMiddleware],
			body: signUpEmailBodySchema,
			metadata: {
				allowedMediaTypes: [
					"application/x-www-form-urlencoded",
					"application/json",
				],
				$Infer: {
					body: {} as {
						name: string;
						email: string;
						password: string;
						image?: string | undefined;
						callbackURL?: string | undefined;
						rememberMe?: boolean | undefined;
					} & AdditionalUserFieldsInput<O>,
					returned: {} as {
						token: string | null;
						user: InferUser<O>;
					},
				},
				openapi: {
					operationId: "signUpWithEmailAndPassword",
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
						"422": {
							description:
								"Unprocessable Entity. User already exists or failed to create user.",
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
			return runWithTransaction(ctx.context.adapter, async () => {
				if (
					!ctx.context.options.emailAndPassword?.enabled ||
					ctx.context.options.emailAndPassword?.disableSignUp
				) {
					throw APIError.from("BAD_REQUEST", {
						message: "Email and password sign up is not enabled",
						code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
					});
				}
				const body = ctx.body as any as User & {
					password: string;
					callbackURL?: string | undefined;
					rememberMe?: boolean | undefined;
				} & {
					[key: string]: any;
				};
				const {
					name,
					email,
					password,
					image,
					callbackURL: _callbackURL,
					rememberMe,
					...rest
				} = body;
				const isValidEmail = z.email().safeParse(email);

				if (!isValidEmail.success) {
					throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
				}

				if (!password || typeof password !== "string") {
					throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_PASSWORD);
				}

				const minPasswordLength = ctx.context.password.config.minPasswordLength;
				if (password.length < minPasswordLength) {
					ctx.context.logger.error("Password is too short");
					throw APIError.from(
						"BAD_REQUEST",
						BASE_ERROR_CODES.PASSWORD_TOO_SHORT,
					);
				}

				const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
				if (password.length > maxPasswordLength) {
					ctx.context.logger.error("Password is too long");
					throw APIError.from(
						"BAD_REQUEST",
						BASE_ERROR_CODES.PASSWORD_TOO_LONG,
					);
				}
				const dbUser = await ctx.context.internalAdapter.findUserByEmail(email);
				if (dbUser?.user) {
					ctx.context.logger.info(
						`Sign-up attempt for existing email: ${email}`,
					);
					throw APIError.from(
						"UNPROCESSABLE_ENTITY",
						BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
					);
				}
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
					const data = parseUserInput(ctx.context.options, rest, "create");
					createdUser = await ctx.context.internalAdapter.createUser({
						email: email.toLowerCase(),
						name,
						image,
						...data,
						emailVerified: false,
					});
					if (!createdUser) {
						throw APIError.from(
							"BAD_REQUEST",
							BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
						);
					}
				} catch (e) {
					if (isDevelopment()) {
						ctx.context.logger.error("Failed to create user", e);
					}
					if (isAPIError(e)) {
						throw e;
					}
					ctx.context.logger?.error("Failed to create user", e);
					throw APIError.from(
						"UNPROCESSABLE_ENTITY",
						BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
					);
				}
				if (!createdUser) {
					throw APIError.from(
						"UNPROCESSABLE_ENTITY",
						BASE_ERROR_CODES.FAILED_TO_CREATE_USER,
					);
				}
				await ctx.context.internalAdapter.linkAccount({
					userId: createdUser.id,
					providerId: "credential",
					accountId: createdUser.id,
					password: hash,
				});
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
					const callbackURL = body.callbackURL
						? encodeURIComponent(body.callbackURL)
						: encodeURIComponent("/");
					const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;

					if (ctx.context.options.emailVerification?.sendVerificationEmail) {
						await ctx.context.runInBackgroundOrAwait(
							ctx.context.options.emailVerification.sendVerificationEmail(
								{
									user: createdUser,
									url,
									token,
								},
								ctx.request,
							),
						);
					}
				}

				if (
					ctx.context.options.emailAndPassword.autoSignIn === false ||
					ctx.context.options.emailAndPassword.requireEmailVerification
				) {
					return ctx.json({
						token: null,
						user: parseUserOutput(
							ctx.context.options,
							createdUser,
						) as InferUser<O>,
					});
				}

				const session = await ctx.context.internalAdapter.createSession(
					createdUser.id,
					rememberMe === false,
				);
				if (!session) {
					throw APIError.from(
						"BAD_REQUEST",
						BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
					);
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
					user: parseUserOutput(
						ctx.context.options,
						createdUser,
					) as InferUser<O>,
				});
			});
		},
	);
