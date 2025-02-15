import { z } from "zod";
import { createAuthEndpoint, createAuthMiddleware } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import type { Account, InferOptionSchema, User } from "../../types";
import { setSessionCookie } from "../../cookies";
import { sendVerificationEmailFn } from "../../api";
import { BASE_ERROR_CODES } from "../../error/codes";
import { TWO_FACTOR_ERROR_CODES } from "../two-factor/error-code";
import { schema } from "./schema";
import { mergeSchema } from "../../db/schema";

export type UsernameOptions = {
	schema?: InferOptionSchema<typeof schema>;
};

export interface UserWithUsername extends User {
	username: string;
}

export const username = <Opts extends UsernameOptions>(options?: Opts) => {
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
					const user = await ctx.context.adapter.findOne<UserWithUsername>({
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
						throw new APIError("FORBIDDEN", {
							message: ERROR_CODES.EMAIL_NOT_VERIFIED,
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
							name: user.name,
							image: user.image,
							createdAt: user.createdAt,
							updatedAt: user.updatedAt,
						},
					});
				},
			),
		},
		schema: mergeSchema(schema, options?.schema),
		hooks: {
			before: [
				{
					matcher(context) {
						return context.path === "/sign-up/email";
					},
					handler: createAuthMiddleware(async (ctx) => {
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
					}),
				},
				{
					matcher(context) {
						return (
							context.path === "/sign-up/email" ||
							context.path === "/update-user"
						);
					},
					async handler(ctx) {
						if (!ctx.body.displayUsername && ctx.body.username) {
							ctx.body.displayUsername = ctx.body.username;
						}
					},
				},
			],
		},
		$ERROR_CODES: TWO_FACTOR_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
