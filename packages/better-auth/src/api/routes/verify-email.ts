import { TimeSpan } from "oslo";
import { createJWT, validateJWT, type JWT } from "oslo/jwt";
import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";
import { redirectURLMiddleware } from "../middlewares/redirect";

export async function createEmailVerificationToken(
	secret: string,
	email: string,
) {
	const token = await createJWT(
		"HS256",
		Buffer.from(secret),
		{
			email: email.toLowerCase(),
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
		use: [redirectURLMiddleware],
	},
	async (ctx) => {
		if (!ctx.context.options.emailVerification?.sendVerificationEmail) {
			ctx.context.logger.error(
				"Verification email isn't enabled. Pass `sendVerificationEmail` in `emailAndPassword` options to enable it.",
			);
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
		await ctx.context.internalAdapter.updateUserByEmail(parsed.email, {
			emailVerified: true,
		});
		if (ctx.query.callbackURL) {
			throw ctx.redirect(ctx.query.callbackURL);
		}
		return ctx.json({
			status: true,
		});
	},
);
