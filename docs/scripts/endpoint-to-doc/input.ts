//@ts-nocheck
import { createAuthEndpoint } from "./index";
import { z } from "zod";

export const resetPasswordPhoneNumber = createAuthEndpoint(
	"/phone-number/reset-password",
	{
		method: "POST",
		body: z.object({
			otp: z.string({
				description:
					'The one time password to reset the password. Eg: "123456"',
			}),
			phoneNumber: z.string({
				description:
					'The phone number to the account which intends to reset the password for. Eg: "+1234567890"',
			}),
			newPassword: z.string({
				description: `The new password. Eg: "new-and-secure-password"`,
			}),
		}),
		metadata: {
			openapi: {
				description: "Reset password using phone number OTP",
				responses: {
					"200": {
						description: "Password reset successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										status: {
											type: "boolean",
											description:
												"Indicates if the password was reset successfully",
											enum: [true],
										},
									},
									required: ["status"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const verification =
			await ctx.context.internalAdapter.findVerificationValue(
				`${ctx.body.phoneNumber}-forget-password`,
			);
		if (!verification) {
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.OTP_NOT_FOUND,
			});
		}
		if (verification.expiresAt < new Date()) {
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.OTP_EXPIRED,
			});
		}
		const [otpValue, attempts] = verification.value.split(":");
		const allowedAttempts = options?.allowedAttempts || 3;
		if (attempts && parseInt(attempts) >= allowedAttempts) {
			await ctx.context.internalAdapter.deleteVerificationValue(
				verification.id,
			);
			throw new APIError("FORBIDDEN", {
				message: "Too many attempts",
			});
		}
		if (ctx.body.otp !== otpValue) {
			await ctx.context.internalAdapter.updateVerificationValue(
				verification.id,
				{
					value: `${otpValue}:${parseInt(attempts || "0") + 1}`,
				},
			);
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.INVALID_OTP,
			});
		}
		const user = await ctx.context.adapter.findOne<User>({
			model: "user",
			where: [
				{
					field: "phoneNumber",
					value: ctx.body.phoneNumber,
				},
			],
		});
		if (!user) {
			throw new APIError("BAD_REQUEST", {
				message: ERROR_CODES.UNEXPECTED_ERROR,
			});
		}
		const hashedPassword = await ctx.context.password.hash(
			ctx.body.newPassword,
		);
		await ctx.context.internalAdapter.updatePassword(user.id, hashedPassword);
		return ctx.json({
			status: true,
		});
	},
);
