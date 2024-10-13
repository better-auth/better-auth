import { TimeSpan } from "oslo";
import { createJWT, parseJWT, type JWT } from "oslo/jwt";
import { validateJWT } from "oslo/jwt";
import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";

export const forgetPassword = createAuthEndpoint(
	"/forget-password",
	{
		method: "POST",
		body: z.object({
			/**
			 * The email address of the user to send a password reset email to.
			 */
			email: z.string().email(),
			/**
			 * The URL to redirect the user to reset their password.
			 * If the token isn't valid or expired, it'll be redirected with a query parameter `?
			 * error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?
			 * token=VALID_TOKEN
			 */
			redirectTo: z.string(),
		}),
	},
	async (ctx) => {
		if (!ctx.context.options.emailAndPassword?.sendResetPassword) {
			ctx.context.logger.error(
				"Reset password isn't enabled.Please pass an emailAndPassword.sendResetPasswordToken function to your auth config!",
			);
			throw new APIError("BAD_REQUEST", {
				message: "Reset password isn't enabled",
			});
		}
		const { email } = ctx.body;
		const user = await ctx.context.internalAdapter.findUserByEmail(email, {
			includeAccounts: true,
		});
		if (!user) {
			ctx.context.logger.error("Reset Password: User not found", { email });
			//only on the server status is false for the client it's always true
			//to avoid leaking information
			return ctx.json(
				{
					status: false,
				},
				{
					body: {
						status: true,
					},
				},
			);
		}
		const token = await createJWT(
			"HS256",
			Buffer.from(ctx.context.secret),
			{
				email: user.user.email,
				redirectTo: ctx.body.redirectTo,
			},
			{
				expiresIn: new TimeSpan(1, "h"),
				issuer: "better-auth",
				subject: "forget-password",
				audiences: [user.user.email],
				includeIssuedTimestamp: true,
			},
		);
		const url = `${ctx.context.baseURL}/reset-password/${token}`;
		await ctx.context.options.emailAndPassword.sendResetPassword(
			url,
			user.user,
		);
		return ctx.json({
			status: true,
		});
	},
);

export const forgetPasswordCallback = createAuthEndpoint(
	"/reset-password/:token",
	{
		method: "GET",
	},
	async (ctx) => {
		const { token } = ctx.params;
		let decodedToken: JWT;
		const schema = z.object({
			email: z.string(),
			redirectTo: z.string(),
		});
		try {
			decodedToken = await validateJWT(
				"HS256",
				Buffer.from(ctx.context.secret),
				token,
			);
			if (!decodedToken.expiresAt || decodedToken.expiresAt < new Date()) {
				throw Error("Token expired");
			}
		} catch (e) {
			const decoded = parseJWT(token);
			const jwt = schema.safeParse(decoded?.payload);
			if (jwt.success) {
				throw ctx.redirect(`${jwt.data?.redirectTo}?error=invalid_token`);
			} else {
				throw ctx.redirect(`${ctx.context.baseURL}/error?error=invalid_token`);
			}
		}
		const { redirectTo } = schema.parse(decodedToken.payload);
		throw ctx.redirect(`${redirectTo}?token=${token}`);
	},
);

export const resetPassword = createAuthEndpoint(
	"/reset-password",
	{
		method: "POST",
		query: z
			.object({
				currentURL: z.string(),
			})
			.optional(),
		body: z.object({
			newPassword: z.string(),
			callbackURL: z.string().optional(),
		}),
	},
	async (ctx) => {
		const token = ctx.query?.currentURL.split("?token=")[1];
		if (!token) {
			throw new APIError("BAD_REQUEST", {
				message: "Token not found",
			});
		}
		const { newPassword } = ctx.body;
		try {
			const jwt = await validateJWT(
				"HS256",
				Buffer.from(ctx.context.secret),
				token,
			);
			const email = z
				.string()
				.email()
				.parse((jwt.payload as { email: string }).email);
			const user = await ctx.context.internalAdapter.findUserByEmail(email);
			if (!user) {
				return ctx.json(
					{
						error: "User not found",
						data: null,
					},
					{
						status: 400,
						body: {
							message: "failed to reset password",
						},
					},
				);
			}
			if (
				newPassword.length <
					(ctx.context.options.emailAndPassword?.minPasswordLength || 8) ||
				newPassword.length >
					(ctx.context.options.emailAndPassword?.maxPasswordLength || 32)
			) {
				throw new APIError("BAD_REQUEST", {
					message: "Password is too short or too long",
				});
			}
			const hashedPassword = await ctx.context.password.hash(newPassword);
			const updatedUser = await ctx.context.internalAdapter.updatePassword(
				user.user.id,
				hashedPassword,
			);
			if (!updatedUser) {
				throw new APIError("BAD_REQUEST", {
					message: "Failed to update password",
				});
			}
			return ctx.json(
				{
					error: null,
					data: {
						status: true,
						url: ctx.body.callbackURL,
						redirect: !!ctx.body.callbackURL,
					},
				},
				{
					body: {
						status: true,
						url: ctx.body.callbackURL,
						redirect: !!ctx.body.callbackURL,
					},
				},
			);
		} catch (e) {
			ctx.context.logger.error("Failed to reset password", e);
			throw new APIError("BAD_REQUEST", {
				message: "Failed to reset password",
			});
		}
	},
);
