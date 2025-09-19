import * as z from "zod";
import { implEndpoint } from "../../better-call/server";
import { APIError } from "better-call";
import { getSessionFromCtx } from "./session";
import { setSessionCookie } from "../../cookies";
import type { GenericEndpointContext, User } from "../../types";
import { jwtVerify, type JWTPayload, type JWTVerifyResult } from "jose";
import { signJWT } from "../../crypto/jwt";
import { originCheck } from "../middlewares";
import { JWTExpired } from "jose/errors";
import { sendVerificationEmailDef, verifyEmailDef } from "./shared";

export async function createEmailVerificationToken(
	secret: string,
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
	const token = await signJWT(
		{
			email: email.toLowerCase(),
			updateTo,
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
export const sendVerificationEmail = () =>
	implEndpoint(sendVerificationEmailDef, async (ctx) => {
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
	});

export const verifyEmail = () =>
	implEndpoint(
		verifyEmailDef,
		[originCheck((ctx) => ctx.query.callbackURL)],
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
					ctx,
				);

				const newToken = await createEmailVerificationToken(
					ctx.context.secret,
					parsed.updateTo,
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
				ctx,
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
