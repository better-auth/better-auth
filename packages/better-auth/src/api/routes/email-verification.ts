import { TimeSpan } from "oslo";
import { createJWT, validateJWT, type JWT } from "oslo/jwt";
import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";
import { getSessionFromCtx } from "./session";

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

export const sendVerificationEmail = createAuthEndpoint(
	"/send-verification-email",
	{
		method: "POST",
		query: z
			.object({
				currentURL: z.string().optional(),
			})
			.optional(),
		body: z.object({
			email: z.string().email(),
			callbackURL: z.string().optional(),
		}),
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
				message: "User not found",
			});
		}
		const token = await createEmailVerificationToken(ctx.context.secret, email);
		const url = `${
			ctx.context.baseURL
		}/verify-email?token=${token}&callbackURL=${
			ctx.body.callbackURL || ctx.query?.currentURL || "/"
		}`;
		await ctx.context.options.emailVerification.sendVerificationEmail(
			user.user,
			url,
			token,
		);
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
			token: z.string(),
			callbackURL: z.string().optional(),
		}),
	},
	async (ctx) => {
		const { token } = ctx.query;
		let jwt: JWT;
		try {
			jwt = await validateJWT("HS256", Buffer.from(ctx.context.secret), token);
		} catch (e) {
			ctx.context.logger.error("Failed to verify email", e);
			throw new APIError("BAD_REQUEST", {
				message: "Invalid token",
			});
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
			throw new APIError("BAD_REQUEST", {
				message: "User not found",
			});
		}
		if (parsed.updateTo) {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				if (ctx.query.callbackURL) {
					throw ctx.redirect(`${ctx.query.callbackURL}?error=unauthorized`);
				}
				throw new APIError("UNAUTHORIZED", {
					message: "Session not found",
				});
			}
			if (session.user.email !== parsed.email) {
				if (ctx.query.callbackURL) {
					throw ctx.redirect(`${ctx.query.callbackURL}?error=unauthorized`);
				}
				throw new APIError("UNAUTHORIZED", {
					message: "Invalid session",
				});
			}

			const updatedUser = await ctx.context.internalAdapter.updateUserByEmail(
				parsed.email,
				{
					email: parsed.updateTo,
				},
			);

			//send verification email to the new email
			await ctx.context.options.emailVerification?.sendVerificationEmail?.(
				updatedUser,
				`${ctx.context.baseURL}/verify-email?token=${token}`,
				token,
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
		if (ctx.query.callbackURL) {
			throw ctx.redirect(ctx.query.callbackURL);
		}
		return ctx.json({
			user: null,
			status: true,
		});
	},
);
