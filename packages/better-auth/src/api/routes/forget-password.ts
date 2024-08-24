import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { createJWT } from "oslo/jwt";
import { TimeSpan } from "oslo";
import { validateJWT } from "oslo/jwt";
import { Argon2id } from "oslo/password";

export const forgetPassword = createAuthEndpoint(
	"/forget-password",
	{
		method: "POST",
		body: z.object({
			/**
			 * The email address of the user to send a password reset email to.
			 */
			email: z.string().email(),
		}),
	},
	async (ctx) => {
		if (!ctx.context.options.emailAndPassword?.sendResetPasswordToken) {
			ctx.context.logger.error(
				"Reset password isn't enabled.Please pass an emailAndPassword.sendResetPasswordToken function to your auth config!",
			);
			return ctx.json(null, {
				status: 400,
				statusText: "RESET_PASSWORD_EMAIL_NOT_SENT",
				body: {
					message: "Reset password isn't enabled",
				},
			});
		}
		const { email } = ctx.body;
		const user = await ctx.context.internalAdapter.findUserByEmail(email);
		if (!user) {
			return ctx.json(
				{
					error: "User not found",
				},
				{
					status: 400,
					statusText: "USER_NOT_FOUND",
					body: {
						message: "User not found",
					},
				},
			);
		}
		const token = await createJWT(
			"HS256",
			Buffer.from(ctx.context.secret),
			{
				email: user.user.email,
			},
			{
				expiresIn: new TimeSpan(1, "h"),
				issuer: "better-auth",
				subject: "forget-password",
				audiences: [user.user.email],
				includeIssuedTimestamp: true,
			},
		);
		await ctx.context.options.emailAndPassword.sendResetPasswordToken(
			token,
			user.user,
		);
		return ctx.json({
			status: true,
		});
	},
);

export const resetPassword = createAuthEndpoint(
	"/reset-password",
	{
		method: "POST",
		body: z.object({
			token: z.string(),
			newPassword: z.string(),
			callbackURL: z.string().optional(),
		}),
	},
	async (ctx) => {
		const { token, newPassword } = ctx.body;
		try {
			const jwt = await validateJWT(
				"HS256",
				Buffer.from(ctx.context.secret),
				token,
			);
			console.log(jwt);
			const email = z
				.string()
				.email()
				.parse((jwt.payload as { email: string }).email);
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				return ctx.json(null, {
					status: 400,
					statusText: "USER_NOT_FOUND",
					body: {
						message: "User not found",
					},
				});
			}
			if (
				newPassword.length <
					(ctx.context.options.emailAndPassword?.minPasswordLength || 8) ||
				newPassword.length >
					(ctx.context.options.emailAndPassword?.maxPasswordLength || 32)
			) {
				return ctx.json(null, {
					status: 400,
					statusText: "INVALID_PASSWORD_LENGTH",
					body: {
						message: "Password length must be between 8 and 32",
					},
				});
			}
			const argon2id = new Argon2id();
			const hashedPassword = await argon2id.hash(newPassword);
			const updatedUser = await ctx.context.internalAdapter.updatePassword(
				user.user.id,
				hashedPassword,
			);
			if (!updatedUser) {
				return ctx.json(null, {
					status: 500,
					statusText: "INTERNAL_SERVER_ERROR",
					body: {
						message: "Internal server error",
					},
				});
			}
			return ctx.json({
				status: true,
				url: ctx.body.callbackURL,
				redirect: !!ctx.body.callbackURL,
			});
		} catch (e) {
			console.log(e);
			return ctx.json(null, {
				status: 400,
				statusText: "INVALID_TOKEN",
				body: {
					message: "Invalid token",
				},
			});
		}
	},
);
