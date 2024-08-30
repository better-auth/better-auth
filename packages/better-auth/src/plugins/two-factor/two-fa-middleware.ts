import { APIError } from "better-call";
import { z } from "zod";
import type { Session } from "../../adapters/schema";
import { createAuthMiddleware } from "../../api/call";
import { signInCredential } from "../../api/routes";
import { hs256 } from "../../crypto";
import { TWO_FACTOR_COOKIE_NAME } from "./constant";
import type { TwoFactorOptions, UserWithTwoFactor } from "./types";

export const verifyTwoFactorMiddleware = createAuthMiddleware(async (ctx) => {
	const cookie = await ctx.getSignedCookie(
		TWO_FACTOR_COOKIE_NAME,
		ctx.context.secret,
	);
	if (!cookie) {
		throw new APIError("UNAUTHORIZED", {
			message: "two factor isn't enabled",
		});
	}
	const [userId, hash] = cookie.split("!");
	if (!userId || !hash) {
		throw new APIError("UNAUTHORIZED", {
			message: "invalid two factor cookie",
		});
	}
	const sessions = await ctx.context.adapter.findMany<Session>({
		model: "session",
		where: [
			{
				field: "userId",
				value: userId,
			},
		],
	});
	if (!sessions.length) {
		throw new APIError("UNAUTHORIZED", {
			message: "invalid session",
		});
	}
	const activeSessions = sessions.filter(
		(session) => session.expiresAt > new Date(),
	);
	if (!activeSessions) {
		throw new APIError("UNAUTHORIZED", {
			message: "invalid session",
		});
	}
	for (const session of activeSessions) {
		const hashToMatch = await hs256(ctx.context.secret, session.id);
		const user = await ctx.context.adapter.findOne<UserWithTwoFactor>({
			model: "user",
			where: [
				{
					field: "id",
					value: session.userId,
				},
			],
		});
		if (!user) {
			throw new APIError("UNAUTHORIZED", {
				message: "invalid session",
			});
		}
		if (hashToMatch === hash) {
			return {
				valid: async () => {
					/**
					 * Set the session cookie
					 */
					await ctx.setSignedCookie(
						ctx.context.authCookies.sessionToken.name,
						session.id,
						ctx.context.secret,
						ctx.context.authCookies.sessionToken.options,
					);
					if (ctx.body.callbackURL) {
						return ctx.json({
							status: true,
							callbackURL: ctx.body.callbackURL,
							redirect: true,
						});
					}

					return ctx.json({ status: true });
				},
				invalid: async () => {
					return ctx.json(
						{ status: false },
						{
							status: 401,
							body: {
								message: "Invalid code",
							},
						},
					);
				},
				session: {
					id: session.id,
					userId: session.userId,
					expiresAt: session.expiresAt,
					user,
				},
			};
		}
	}
	throw new APIError("UNAUTHORIZED", {
		message: "invalid two factor authentication",
	});
});

export const twoFactorMiddleware = (options: TwoFactorOptions) =>
	createAuthMiddleware(
		{
			body: z.object({
				email: z.string().email(),
				password: z.string(),
				/**
				 * Callback URL to
				 * redirect to after
				 * the user has signed in.
				 */
				callbackURL: z.string().optional(),
			}),
		},
		async (ctx) => {
			//@ts-ignore
			const signIn = await signInCredential({
				...ctx,
				body: ctx.body,
			});
			if (!signIn?.user) {
				return new Response(null, {
					status: 401,
				});
			}
			const user = signIn.user as UserWithTwoFactor;
			if (!user.twoFactorEnabled) {
				return new Response(JSON.stringify(signIn), {
					headers: ctx.responseHeader,
				});
			}
			/**
			 * remove the session cookie. It's set by the sign in credential
			 */
			ctx.setCookie(ctx.context.authCookies.sessionToken.name, "", {
				path: "/",
				sameSite: "lax",
				httpOnly: true,
				secure: false,
				maxAge: 0,
			});
			const hash = await hs256(ctx.context.secret, signIn.session.id);
			/**
			 * We set the user id and the session
			 * id as a hash. Later will fetch for
			 * sessions with the user id compare
			 * the hash and set that as session.
			 */
			await ctx.setSignedCookie(
				"better-auth.two-factor",
				`${signIn.session.userId}!${hash}`,
				ctx.context.secret,
				ctx.context.authCookies.sessionToken.options,
			);
			return new Response(
				JSON.stringify({
					url: options.twoFactorURL || ctx.body.callbackURL || "/",
					redirect: true,
				}),
				{
					headers: ctx.responseHeader,
				},
			);
		},
	);
