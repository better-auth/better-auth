//@ts-nocheck
import { createAuthEndpoint, originCheck } from "./index";
import { z } from "zod";

const types = ["email-verification", "sign-in", "forget-password"] as const;

export const resetPasswordEmailOTP = createAuthEndpoint(
	"/email-otp/reset-password",
	{
		method: "POST",
		body: z.object({
			email: z.string({
				description: "Email address to reset the password. Eg: \"user@example.com\"",
			}),
			otp: z.string({
				description: "OTP sent to the email. Eg: \"123456\"",
			}),
			password: z.string({
				description: "New password. Eg: \"new-secure-password\"",
			}),
		}),
		metadata: {
			openapi: {
				description: "Reset password with email OTP",
				responses: {
					200: {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										success: {
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
		const email = ctx.body.email;
		const user = await ctx.context.internalAdapter.findUserByEmail(
			email,
			{
				includeAccounts: true,
			},
		);
		if (!user) {
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.USER_NOT_FOUND,
			});
		}
		const verificationValue =
			await ctx.context.internalAdapter.findVerificationValue(
				`forget-password-otp-${email}`,
			);
		if (!verificationValue) {
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.INVALID_OTP,
			});
		}
		if (verificationValue.expiresAt < new Date()) {
			await ctx.context.internalAdapter.deleteVerificationValue(
				verificationValue.id,
			);
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.OTP_EXPIRED,
			});
		}
		const [otpValue, attempts] = verificationValue.value.split(":");
		const allowedAttempts = options?.allowedAttempts || 3;
		if (attempts && parseInt(attempts) >= allowedAttempts) {
			await ctx.context.internalAdapter.deleteVerificationValue(
				verificationValue.id,
			);
			throw new APIError("FORBIDDEN", {
				message: ERROR_CODES.TOO_MANY_ATTEMPTS,
			});
		}
		if (ctx.body.otp !== otpValue) {
			await ctx.context.internalAdapter.updateVerificationValue(
				verificationValue.id,
				{
					value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
				},
			);
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.INVALID_OTP,
			});
		}
		await ctx.context.internalAdapter.deleteVerificationValue(
			verificationValue.id,
		);
		const passwordHash = await ctx.context.password.hash(
			ctx.body.password,
		);
		const account = user.accounts.find(
			(account) => account.providerId === "credential",
		);
		if (!account) {
			await ctx.context.internalAdapter.createAccount(
				{
					userId: user.user.id,
					providerId: "credential",
					accountId: user.user.id,
					password: passwordHash,
				},
				ctx,
			);
		} else {
			await ctx.context.internalAdapter.updatePassword(
				user.user.id,
				passwordHash,
				ctx,
			);
		}

		return ctx.json({
			success: true,
		});
	},
)