import { APIError } from "better-call";
import { z } from "zod";
import { createAuthEndpoint } from "../../../api/call";
import { verifyTwoFactor } from "../verify-two-factor";
import type {
	TwoFactorProvider,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import { generateRandomString } from "../../../crypto";
import { setSessionCookie } from "../../../cookies";
import { BASE_ERROR_CODES } from "../../../error/codes";

export interface OTPOptions {
	/**
	 * How long the opt will be valid for in
	 * minutes
	 *
	 * @default "3 mins"
	 */
	period?: number;
	/**
	 * Number of digits for the OTP code
	 *
	 * @default 6
	 */
	digits?: number;
	/**
	 * Send the otp to the user
	 *
	 * @param user - The user to send the otp to
	 * @param otp - The otp to send
	 * @param request - The request object
	 * @returns void | Promise<void>
	 */
	sendOTP?: (
		/**
		 * The user to send the otp to
		 * @type UserWithTwoFactor
		 * @default UserWithTwoFactors
		 */
		data: {
			user: UserWithTwoFactor;
			otp: string;
		},
		/**
		 * The request object
		 */
		request?: Request,
	) => Promise<void> | void;
	/**
	 * The number of allowed attempts for the OTP
	 *
	 * @default 5
	 */
	allowedAttempts?: number;
}

/**
 * The otp adapter is created from the totp adapter.
 */
export const otp2fa = (options?: OTPOptions) => {
	const opts = {
		...options,
		digits: options?.digits || 6,
		period: (options?.period || 3) * 60 * 1000,
	};
	const twoFactorTable = "twoFactor";

	/**
	 * Generate OTP and send it to the user.
	 */
	const send2FaOTP = createAuthEndpoint(
		"/two-factor/send-otp",
		{
			method: "POST",
			body: z
				.object({
					/**
					 * if true, the device will be trusted
					 * for 30 days. It'll be refreshed on
					 * every sign in request within this time.
					 */
					trustDevice: z.boolean().optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					summary: "Send two factor OTP",
					description: "Send two factor OTP to the user",
					responses: {
						200: {
							description: "Successful response",
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
			if (!options || !options.sendOTP) {
				ctx.context.logger.error(
					"send otp isn't configured. Please configure the send otp function on otp options.",
				);
				throw new APIError("BAD_REQUEST", {
					message: "otp isn't configured",
				});
			}
			const { session, key } = await verifyTwoFactor(ctx);
			const twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
				model: twoFactorTable,
				where: [
					{
						field: "userId",
						value: session.user.id,
					},
				],
			});
			if (!twoFactor) {
				throw new APIError("BAD_REQUEST", {
					message: TWO_FACTOR_ERROR_CODES.OTP_NOT_ENABLED,
				});
			}
			const code = generateRandomString(opts.digits, "0-9");
			await ctx.context.internalAdapter.createVerificationValue(
				{
					value: `${code}!0`,
					identifier: `2fa-otp-${key}`,
					expiresAt: new Date(Date.now() + opts.period),
				},
				ctx,
			);
			await options.sendOTP(
				{ user: session.user as UserWithTwoFactor, otp: code },
				ctx.request,
			);
			return ctx.json({ status: true });
		},
	);

	const verifyOTP = createAuthEndpoint(
		"/two-factor/verify-otp",
		{
			method: "POST",
			body: z.object({
				code: z.string({
					description: "The otp code to verify",
				}),
				/**
				 * if true, the device will be trusted
				 * for 30 days. It'll be refreshed on
				 * every sign in request within this time.
				 */
				trustDevice: z.boolean().optional(),
			}),
			metadata: {
				openapi: {
					summary: "Verify two factor OTP",
					description: "Verify two factor OTP",
					responses: {
						"200": {
							description: "Two-factor OTP verified successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											token: {
												type: "string",
												description:
													"Session token for the authenticated session",
											},
											user: {
												type: "object",
												properties: {
													id: {
														type: "string",
														description: "Unique identifier of the user",
													},
													email: {
														type: "string",
														format: "email",
														nullable: true,
														description: "User's email address",
													},
													emailVerified: {
														type: "boolean",
														nullable: true,
														description: "Whether the email is verified",
													},
													name: {
														type: "string",
														nullable: true,
														description: "User's name",
													},
													image: {
														type: "string",
														format: "uri",
														nullable: true,
														description: "User's profile image URL",
													},
													createdAt: {
														type: "string",
														format: "date-time",
														description: "Timestamp when the user was created",
													},
													updatedAt: {
														type: "string",
														format: "date-time",
														description:
															"Timestamp when the user was last updated",
													},
												},
												required: ["id", "createdAt", "updatedAt"],
												description: "The authenticated user object",
											},
										},
										required: ["token", "user"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const { session, key, valid, invalid } = await verifyTwoFactor(ctx);
			const twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
				model: twoFactorTable,
				where: [
					{
						field: "userId",
						value: session.user.id,
					},
				],
			});
			if (!twoFactor) {
				throw new APIError("BAD_REQUEST", {
					message: TWO_FACTOR_ERROR_CODES.OTP_NOT_ENABLED,
				});
			}
			const toCheckOtp =
				await ctx.context.internalAdapter.findVerificationValue(
					`2fa-otp-${key}`,
				);
			const [otp, counter] = toCheckOtp?.value?.split("!") ?? [];
			if (!toCheckOtp || toCheckOtp.expiresAt < new Date()) {
				if (toCheckOtp) {
					await ctx.context.internalAdapter.deleteVerificationValue(
						toCheckOtp.id,
					);
				}
				throw new APIError("BAD_REQUEST", {
					message: TWO_FACTOR_ERROR_CODES.OTP_HAS_EXPIRED,
				});
			}
			const allowedAttempts = options?.allowedAttempts || 5;
			if (parseInt(counter) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationValue(
					toCheckOtp.id,
				);
				throw new APIError("BAD_REQUEST", {
					message: TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
				});
			}
			if (otp === ctx.body.code) {
				if (!session.user.twoFactorEnabled) {
					if (!session.session) {
						throw new APIError("BAD_REQUEST", {
							message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
						});
					}
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						session.user.id,
						{
							twoFactorEnabled: true,
						},
					);
					const newSession = await ctx.context.internalAdapter.createSession(
						session.user.id,
						ctx,
						false,
						session.session,
					);
					await ctx.context.internalAdapter.deleteSession(
						session.session.token,
					);
					await setSessionCookie(ctx, {
						session: newSession,
						user: updatedUser,
					});
					return ctx.json({
						token: newSession.token,
						user: {
							id: updatedUser.id,
							email: updatedUser.email,
							emailVerified: updatedUser.emailVerified,
							name: updatedUser.name,
							image: updatedUser.image,
							createdAt: updatedUser.createdAt,
							updatedAt: updatedUser.updatedAt,
						},
					});
				}
				return valid(ctx);
			} else {
				await ctx.context.internalAdapter.updateVerificationValue(
					toCheckOtp.id,
					{
						value: `${otp}!${parseInt(counter) + 1}`,
					},
				);
				return invalid("INVALID_CODE");
			}
		},
	);

	return {
		id: "otp",
		endpoints: {
			sendTwoFactorOTP: send2FaOTP,
			verifyTwoFactorOTP: verifyOTP,
		},
	} satisfies TwoFactorProvider;
};
