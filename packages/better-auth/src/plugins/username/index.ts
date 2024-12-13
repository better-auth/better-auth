import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import type { Account, User } from "../../db/schema";
import { setSessionCookie } from "../../cookies";
import { sendVerificationEmailFn } from "../../api";
import { BASE_ERROR_CODES } from "../../error/codes";
import { TWO_FACTOR_ERROR_CODES } from "../two-factor/error-code";

export const username = () => {
	const ERROR_CODES = {
		INVALID_USERNAME_OR_PASSWORD: "invalid username or password",
		EMAIL_NOT_VERIFIED: "email not verified",
		UNEXPECTED_ERROR: "unexpected error",
		USERNAME_IS_ALREADY_TAKEN: "username is already taken. please try another.",
	};
	return {
		id: "username",
		endpoints: {
			signInUsername: createAuthEndpoint(
				"/sign-in/username",
				{
					method: "POST",
					body: z.object({
						username: z.string({
							description: "The username of the user",
						}),
						password: z.string({
							description: "The password of the user",
						}),
						rememberMe: z
							.boolean({
								description: "Remember the user session",
							})
							.optional(),
					}),
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
													user: {
														$ref: "#/components/schemas/User",
													},
													session: {
														$ref: "#/components/schemas/Session",
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
					const user = await ctx.context.adapter.findOne<User>({
						model: "user",
						where: [
							{
								field: "username",
								value: ctx.body.username.toLowerCase(),
							},
						],
					});
					if (!user) {
						await ctx.context.password.hash(ctx.body.password);
						ctx.context.logger.error("User not found", { username });
						throw new APIError("UNAUTHORIZED", {
							message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
						});
					}

					if (
						!user.emailVerified &&
						ctx.context.options.emailAndPassword?.requireEmailVerification
					) {
						await sendVerificationEmailFn(ctx, user);
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
						ctx.context.logger.error("Password not found", { username });
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
					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx.request,
						ctx.body.rememberMe === false,
					);
					if (!session) {
						return ctx.json(null, {
							status: 500,
							body: {
								message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
								status: 500,
							},
						});
					}
					await setSessionCookie(
						ctx,
						{ session, user },
						ctx.body.rememberMe === false,
					);
					return ctx.json({
						id: user.id,
						email: user.email,
						name: user.name,
						image: user.image,
						emailVerified: user.emailVerified,
						createdAt: user.createdAt,
						updatedAt: user.updatedAt,
					});
				},
			),
		},
		schema: {
			user: {
				fields: {
					username: {
						type: "string",
						required: false,
						unique: true,
						returned: true,
						transform: {
							input(value) {
								return value?.toString().toLowerCase();
							},
						},
					},
				},
			},
		},
		hooks: {
			before: [
				{
					matcher(context) {
						return context.path === "/sign-up/email";
					},
					async handler(ctx) {
						const username = ctx.body.username;
						if (username) {
							const user = await ctx.context.adapter.findOne<User>({
								model: "user",
								where: [
									{
										field: "username",
										value: username.toLowerCase(),
									},
								],
							});
							if (user) {
								throw new APIError("UNPROCESSABLE_ENTITY", {
									message: ERROR_CODES.USERNAME_IS_ALREADY_TAKEN,
								});
							}
						}
					},
				},
			],
		},
		$ERROR_CODES: TWO_FACTOR_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
