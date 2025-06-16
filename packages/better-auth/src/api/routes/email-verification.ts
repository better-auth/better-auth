import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";
import { getSessionFromCtx } from "./session";
import { setSessionCookie } from "../../cookies";
import type { GenericEndpointContext, User } from "../../types";
import { BASE_ERROR_CODES } from "../../error/codes";
import { originCheck } from "../middlewares";
import { generateId } from "../../utils";
import type { InternalAdapter } from "../../db/internal-adapter";
import { getDate } from "../../utils/date";

export async function createEmailVerificationToken(
	adapter: InternalAdapter,
	email: string,
	/**
	 * The email to update from
	 */
	updateTo?: string,
	/**
	 * The time in seconds for the token to expire
	 */
	expiresIn: number = 3600,
) {
	const token = generateId(32);
	const identifier = updateTo
		? `email-change:${email}:${updateTo}`
		: `email-verification:${email}`;
	await adapter.createVerificationValue({
		identifier,
		value: token,
		expiresAt: getDate(expiresIn, "sec"),
	});
	return token;
}

/**
 * A function to send a verification email to the user
 */
export async function sendVerificationEmailFn(
	ctx: GenericEndpointContext,
	user: User,
) {
	if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
		ctx.context.logger.error("Verification email isn't enabled.");
		throw new APIError("BAD_REQUEST", {
			message: "Verification email isn't enabled",
		});
	}
	const token = await createEmailVerificationToken(
		ctx.context.internalAdapter,
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
export const sendVerificationEmail = createAuthEndpoint(
	"/send-verification-email",
	{
		method: "POST",
		body: z.object({
			email: z
				.string({
					description: "The email to send the verification email to",
				})
				.email(),
			callbackURL: z
				.string({
					description: "The URL to use for email verification callback",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				description: "Send a verification email to the user",
				requestBody: {
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									email: {
										type: "string",
										description: "The email to send the verification email to",
										example: "user@example.com",
									},
									callbackURL: {
										type: "string",
										description:
											"The URL to use for email verification callback",
										example: "https://example.com/callback",
										nullable: true,
									},
								},
								required: ["email"],
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
											description:
												"Indicates if the email was sent successfully",
											example: true,
										},
									},
								},
							},
						},
					},
					"400": {
						description: "Bad Request",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										message: {
											type: "string",
											description: "Error message",
											example: "Verification email isn't enabled",
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
		if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
			ctx.context.logger.error("Verification email isn't enabled.");
			throw new APIError("BAD_REQUEST", {
				message: "Verification email isn't enabled",
			});
		}
		const { email } = ctx.body;
		const session = await getSessionFromCtx(ctx);
		if (!session) {
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				//we're returning true to avoid leaking information about the user
				return ctx.json({
					status: true,
				});
			}
			await sendVerificationEmailFn(ctx, user.user);
			return ctx.json({
				status: true,
			});
		}
		if (session?.user.emailVerified) {
			throw new APIError("BAD_REQUEST", {
				message:
					"You can only send a verification email to an unverified email",
			});
		}
		if (session?.user.email !== email) {
			throw new APIError("BAD_REQUEST", {
				message: "You can only send a verification email to your own email",
			});
		}
		await sendVerificationEmailFn(ctx, session.user);
		return ctx.json({
			status: true,
		});
	},
);

export const verifyEmail = createAuthEndpoint(
	"/verify-email",
	{
		method: "GET",
		query: z.object({
			token: z.string({
				description: "The token to verify the email",
			}),
			callbackURL: z
				.string({
					description: "The URL to redirect to after email verification",
				})
				.optional(),
		}),
		use: [originCheck((ctx) => ctx.query.callbackURL)],
		metadata: {
			openapi: {
				description: "Verify the email of the user",
				parameters: [
					{
						name: "token",
						in: "query",
						description: "The token to verify the email",
						required: true,
						schema: {
							type: "string",
						},
					},
					{
						name: "callbackURL",
						in: "query",
						description: "The URL to redirect to after email verification",
						required: false,
						schema: {
							type: "string",
						},
					},
				],
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										user: {
											type: "object",
											properties: {
												id: {
													type: "string",
													description: "User ID",
												},
												email: {
													type: "string",
													description: "User email",
												},
												name: {
													type: "string",
													description: "User name",
												},
												image: {
													type: "string",
													description: "User image URL",
												},
												emailVerified: {
													type: "boolean",
													description:
														"Indicates if the user email is verified",
												},
												createdAt: {
													type: "string",
													description: "User creation date",
												},
												updatedAt: {
													type: "string",
													description: "User update date",
												},
											},
											required: [
												"id",
												"email",
												"name",
												"image",
												"emailVerified",
												"createdAt",
												"updatedAt",
											],
										},
										status: {
											type: "boolean",
											description:
												"Indicates if the email was verified successfully",
										},
									},
									required: ["user", "status"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		function redirectOnError(error: string) {
			if (ctx.query.callbackURL) {
				if (ctx.query.callbackURL.includes("?")) {
					throw ctx.redirect(`${ctx.query.callbackURL}&error=${error}`);
				}
				throw ctx.redirect(`${ctx.query.callbackURL}?error=${error}`);
			}
			throw new APIError("UNAUTHORIZED", {
				message: error,
			});
		}
		const { token } = ctx.query;

		const verification =
			await ctx.context.internalAdapter.findVerificationValueByToken(token);
		if (!verification) {
			return redirectOnError("invalid_token");
		}

		if (verification.expiresAt < new Date()) {
			await ctx.context.internalAdapter.deleteVerificationByToken(token);
			return redirectOnError("token_expired");
		}

		await ctx.context.internalAdapter.deleteVerificationByToken(token);

		const [type, ...rest] = verification.identifier.split(":");

		if (type === "email-change") {
			const [email, newEmail] = rest;
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				if (ctx.query.callbackURL) {
					throw ctx.redirect(`${ctx.query.callbackURL}?error=unauthorized`);
				}
				return redirectOnError("unauthorized");
			}
			if (session.user.email !== email) {
				if (ctx.query.callbackURL) {
					throw ctx.redirect(`${ctx.query.callbackURL}?error=unauthorized`);
				}
				return redirectOnError("unauthorized");
			}

			const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(
				email,
				{
					email: newEmail,
					emailVerified: false,
				},
				ctx,
			);
			const newToken = await createEmailVerificationToken(
				ctx.context.internalAdapter,
				newEmail,
			);
			
			//send verification email to the new email
			await ctx.context.options.emailVerification?.sendVerificationEmail?.(
				{
					user: updatedUser,
					url: `${
						ctx.context.baseURL
					}/verify-email?token=${newToken}&callbackURL=${
						ctx.query.callbackURL || "/"
					}`,
					token: newToken,
				},
				ctx.request,
			);

			await setSessionCookie(ctx, {
				session: session.session,
				user: {
					...session.user,
					email: newEmail,
					emailVerified: false,
				},
			});

			if (ctx.query.callbackURL) {
				throw ctx.redirect(ctx.query.callbackURL);
			}
			return ctx.json({
				status: true,
				user: {
					id: updatedUser.id,
					email: updatedUser.email,
					name: updatedUser.name,
					image: updatedUser.image,
					emailVerified: updatedUser.emailVerified,
					createdAt: updatedUser.createdAt,
					updatedAt: updatedUser.updatedAt,
				},
			});
		}

		const [email] = rest;
		const user = await ctx.context.internalAdapter.findUserByEmail(email);

		if (!user) {
			return redirectOnError("user_not_found");
		}

		await ctx.context.options.emailVerification?.onEmailVerification?.(
			user.user,
			ctx.request,
		);
		await ctx.context.internalAdapter.updateUserByEmail(
			email,
			{
				emailVerified: true,
			},
			ctx,
		);
		const currentSession = await getSessionFromCtx(ctx);
		if (ctx.context.options.emailVerification?.autoSignInAfterVerification) {
			if (!currentSession || currentSession.user.email !== email) {
				const session = await ctx.context.internalAdapter.createSession(
					user.user.id,
					ctx,
				);
				if (!session) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "Failed to create session",
					});
				}
				await setSessionCookie(ctx, {
					session,
					user: {
						...user.user,
						emailVerified: true,
					},
				});
			} else {
				await setSessionCookie(ctx, {
					session: currentSession.session,
					user: {
						...currentSession.user,
						emailVerified: true,
					},
				});
			}
		}

		if (ctx.query.callbackURL) {
			throw ctx.redirect(ctx.query.callbackURL);
		}
		return ctx.json({
			status: true,
			user: null,
		});
	},
);
