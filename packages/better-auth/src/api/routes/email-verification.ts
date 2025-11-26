import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-call";
import type { JWTPayload, JWTVerifyResult } from "jose";
import { jwtVerify } from "jose";
import { JWTExpired } from "jose/errors";
import * as z from "zod";
import { setSessionCookie } from "../../cookies";
import { signJWT } from "../../crypto/jwt";
import type { User } from "../../types";
import { originCheck } from "../middlewares";
import { getSessionFromCtx } from "./session";

export async function createEmailVerificationToken(
	secret: string,
	email: string,
	/**
	 * The email to update from
	 */
	updateTo?: string | undefined,
	/**
	 * The time in seconds for the token to expire
	 */
	expiresIn: number = 3600,
	/**
	 * Extra payload to include in the token
	 */
	extraPayload?: Record<string, any>,
) {
	const token = await signJWT(
		{
			email: email.toLowerCase(),
			updateTo,
			...extraPayload,
		},
		secret,
		expiresIn,
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
		undefined,
		ctx.context.options.emailVerification?.expiresIn,
	);
	const callbackURL = ctx.body.callbackURL
		? encodeURIComponent(ctx.body.callbackURL)
		: encodeURIComponent("/");
	const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
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
		operationId: "sendVerificationEmail",
		body: z.object({
			email: z.email().meta({
				description: "The email to send the verification email to",
			}),
			callbackURL: z
				.string()
				.meta({
					description: "The URL to use for email verification callback",
				})
				.optional(),
		}),
		metadata: {
			openapi: {
				operationId: "sendVerificationEmail",
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
				await createEmailVerificationToken(
					ctx.context.secret,
					email,
					undefined,
					ctx.context.options.emailVerification?.expiresIn,
				);
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
		operationId: "verifyEmail",
		query: z.object({
			token: z.string().meta({
				description: "The token to verify the email",
			}),
			callbackURL: z
				.string()
				.meta({
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
											$ref: "#/components/schemas/User",
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
		let jwt: JWTVerifyResult<JWTPayload>;
		try {
			jwt = await jwtVerify(
				token,
				new TextEncoder().encode(ctx.context.secret),
				{
					algorithms: ["HS256"],
				},
			);
		} catch (e) {
			if (e instanceof JWTExpired) {
				return redirectOnError("token_expired");
			}
			return redirectOnError("invalid_token");
		}
		const schema = z.object({
			email: z.email(),
			updateTo: z.string().optional(),
			requestType: z.string().optional(),
		});
		const parsed = schema.parse(jwt.payload);
		const user = await ctx.context.internalAdapter.findUserByEmail(
			parsed.email,
		);
		if (!user) {
			return redirectOnError("user_not_found");
		}
		if (parsed.updateTo) {
			let session = await getSessionFromCtx(ctx);
			if (session && session.user.email !== parsed.email) {
				return redirectOnError("unauthorized");
			}
			if (parsed.requestType === "change-email-confirmation") {
				const newToken = await createEmailVerificationToken(
					ctx.context.secret,
					parsed.email,
					parsed.updateTo,
					ctx.context.options.emailVerification?.expiresIn,
					{
						requestType: "change-email-verification",
					},
				);
				const updateCallbackURL = ctx.query.callbackURL
					? encodeURIComponent(ctx.query.callbackURL)
					: encodeURIComponent("/");
				const url = `${ctx.context.baseURL}/verify-email?token=${newToken}&callbackURL=${updateCallbackURL}`;
				await ctx.context.options.emailVerification?.sendVerificationEmail?.(
					{
						user: {
							...user.user,
							email: parsed.updateTo,
						},
						url,
						token: newToken,
					},
					ctx.request,
				);
				if (ctx.query.callbackURL) {
					throw ctx.redirect(ctx.query.callbackURL);
				}
				return ctx.json({
					status: true,
				});
			}
			if (!session) {
				const newSession = await ctx.context.internalAdapter.createSession(
					user.user.id,
				);
				if (!newSession) {
					throw new APIError("INTERNAL_SERVER_ERROR", {
						message: "Failed to create session",
					});
				}
				session = {
					session: newSession,
					user: user.user,
				};
			}
			if (parsed.requestType === "change-email-verification") {
				const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(
					parsed.email,
					{
						email: parsed.updateTo,
						emailVerified: true,
					},
				);
				await setSessionCookie(ctx, {
					session: session.session,
					user: {
						...session.user,
						email: parsed.updateTo,
						emailVerified: true,
					},
				});
				if (ctx.query.callbackURL) {
					throw ctx.redirect(ctx.query.callbackURL);
				}
				return ctx.json({
					status: true,
					user: updatedUser,
				});
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
			const updateCallbackURL = ctx.query.callbackURL
				? encodeURIComponent(ctx.query.callbackURL)
				: encodeURIComponent("/");
			await ctx.context.options.emailVerification?.sendVerificationEmail?.(
				{
					user: updatedUser,
					url: `${ctx.context.baseURL}/verify-email?token=${newToken}&callbackURL=${updateCallbackURL}`,
					token: newToken,
				},
				ctx.request,
			);

			await setSessionCookie(ctx, {
				session: session.session,
				user: {
					...session.user,
					email: parsed.updateTo,
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
		if (user.user.emailVerified) {
			if (ctx.query.callbackURL) {
				throw ctx.redirect(ctx.query.callbackURL);
			}
			return ctx.json({
				status: true,
				user: null,
			});
		}
		if (ctx.context.options.emailVerification?.onEmailVerification) {
			await ctx.context.options.emailVerification.onEmailVerification(
				user.user,
				ctx.request,
			);
		}
		const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(
			parsed.email,
			{
				emailVerified: true,
			},
		);
		if (ctx.context.options.emailVerification?.afterEmailVerification) {
			await ctx.context.options.emailVerification.afterEmailVerification(
				updatedUser,
				ctx.request,
			);
		}
		if (ctx.context.options.emailVerification?.autoSignInAfterVerification) {
			const currentSession = await getSessionFromCtx(ctx);
			if (!currentSession || currentSession.user.email !== parsed.email) {
				const session = await ctx.context.internalAdapter.createSession(
					user.user.id,
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
