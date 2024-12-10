import { TimeSpan } from "oslo";
import { createJWT, validateJWT, type JWT } from "oslo/jwt";
import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";
import { getSessionFromCtx } from "./session";
import { setSessionCookie } from "../../cookies";
import type { GenericEndpointContext, User } from "../../types";
import { BASE_ERROR_CODES } from "../../error/codes";

export async function createEmailVerificationToken(
	secret: string,
	email: string,
	/**
	 * The email to update from
	 */
	updateTo?: string,
) {
	const token = await createJWT(
		"HS256",
		Buffer.from(secret),
		{
			email: email.toLowerCase(),
			updateTo,
		},
		{
			expiresIn: new TimeSpan(1, "h"),
			issuer: "better-auth",
			subject: "verify-email",
			audiences: [email],
			includeIssuedTimestamp: true,
		},
	);
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
		ctx.context.secret,
		user.email,
	);
	const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${
		ctx.body.callbackURL || ctx.query?.currentURL || "/"
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
		query: z
			.object({
				currentURL: z
					.string({
						description: "The URL to use for email verification callback",
					})
					.optional(),
			})
			.optional(),
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
									},
									callbackURL: {
										type: "string",
										description:
											"The URL to use for email verification callback",
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
		const user = await ctx.context.internalAdapter.findUserByEmail(email);
		if (!user) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.USER_NOT_FOUND,
			});
		}
		await sendVerificationEmailFn(ctx, user.user);
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
		metadata: {
			openapi: {
				description: "Verify the email of the user",
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
										},
										status: {
											type: "boolean",
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
				throw ctx.redirect(`${ctx.query.callbackURL}?error=${error}`);
			}
			throw new APIError("UNAUTHORIZED", {
				message: error,
			});
		}
		const { token } = ctx.query;
		let jwt: JWT;
		try {
			jwt = await validateJWT("HS256", Buffer.from(ctx.context.secret), token);
		} catch (e) {
			ctx.context.logger.error("Failed to verify email", e);
			return redirectOnError("invalid_token");
		}
		const schema = z.object({
			email: z.string().email(),
			updateTo: z.string().optional(),
		});
		const parsed = schema.parse(jwt.payload);
		const user = await ctx.context.internalAdapter.findUserByEmail(
			parsed.email,
		);
		if (!user) {
			return redirectOnError("user_not_found");
		}
		if (parsed.updateTo) {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				if (ctx.query.callbackURL) {
					throw ctx.redirect(`${ctx.query.callbackURL}?error=unauthorized`);
				}
				return redirectOnError("unauthorized");
			}
			if (session.user.email !== parsed.email) {
				if (ctx.query.callbackURL) {
					throw ctx.redirect(`${ctx.query.callbackURL}?error=unauthorized`);
				}
				return redirectOnError("unauthorized");
			}

			const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(
				parsed.email,
				{
					email: parsed.updateTo,
					emailVerified: false,
				},
			);

			const newToken = await createEmailVerificationToken(
				ctx.context.secret,
				parsed.updateTo,
			);

			//send verification email to the new email
			await ctx.context.options.emailVerification?.sendVerificationEmail?.(
				{
					user: updatedUser,
					url: `${ctx.context.baseURL}/verify-email?token=${newToken}`,
					token: newToken,
				},
				ctx.request,
			);

			if (ctx.query.callbackURL) {
				throw ctx.redirect(ctx.query.callbackURL);
			}
			return ctx.json({
				user: updatedUser,
				status: true,
			});
		}
		await ctx.context.internalAdapter.updateUserByEmail(parsed.email, {
			emailVerified: true,
		});

		if (ctx.context.options.emailVerification?.autoSignInAfterVerification) {
			const currentSession = await getSessionFromCtx(ctx);
			if (!currentSession) {
				const session = await ctx.context.internalAdapter.createSession(
					user.user.id,
					ctx.request,
				);
				if (!session) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "Failed to create session",
					});
				}
				await setSessionCookie(ctx, { session, user: user.user });
			}
		}

		if (ctx.query.callbackURL) {
			throw ctx.redirect(ctx.query.callbackURL);
		}
		return ctx.json({
			user: null,
			status: true,
		});
	},
);
