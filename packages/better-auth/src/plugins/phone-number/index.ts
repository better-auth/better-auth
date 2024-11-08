import { z } from "zod";
import { createAuthEndpoint } from "../../api/call";
import type { BetterAuthPlugin } from "../../types/plugins";
import { APIError } from "better-call";
import type { User } from "../../db/schema";
import { alphabet, generateRandomString } from "../../crypto/random";
import { getSessionFromCtx } from "../../api";
import { getDate } from "../../utils/date";
import { logger } from "../../utils/logger";
import { setSessionCookie } from "../../cookies";

export interface UserWithPhoneNumber extends User {
	phoneNumber: string;
	phoneNumberVerified: boolean;
}

function generateOTP(size: number) {
	return generateRandomString(size, alphabet("0-9"));
}

export const phoneNumber = (options?: {
	/**
	 * Length of the OTP code
	 * @default 6
	 */
	otpLength?: number;
	/**
	 * Send OTP code to the user
	 *
	 * @param phoneNumber
	 * @param code
	 * @returns
	 */
	sendOTP: (phoneNumber: string, code: string) => Promise<void> | void;
	/**
	 * custom function to verify the OTP code
	 */
	verifyOTP?: (phoneNumber: string, code: string) => Promise<boolean> | boolean;
	/**
	 * Expiry time of the OTP code in seconds
	 * @default 300
	 */
	expiresIn?: number;
	/**
	 * Function to validate phone number
	 *
	 * by default any string is accepted
	 */
	phoneNumberValidator?: (phoneNumber: string) => boolean;
	/**
	 * Sign up user after phone number verification
	 *
	 * the user will be signed up with the temporary email
	 * and the phone number will be updated after verification
	 */
	signUpOnVerification?: {
		/**
		 * When a user signs up, a temporary email will be need to be created
		 * to sign up the user. This function should return a temporary email
		 * for the user given the phone number
		 *
		 * @param phoneNumber
		 * @returns string (temporary email)
		 */
		getTempEmail: (phoneNumber: string) => string;
		/**
		 * When a user signs up, a temporary name will be need to be created
		 * to sign up the user. This function should return a temporary name
		 * for the user given the phone number
		 *
		 * @param phoneNumber
		 * @returns string (temporary name)
		 *
		 * @default phoneNumber - the phone number will be used as the name
		 */
		getTempName?: (phoneNumber: string) => string;
	};
}) => {
	const opts = {
		phoneNumber: "phoneNumber",
		phoneNumberVerified: "phoneNumberVerified",
		code: "code",
		createdAt: "createdAt",
		expiresIn: options?.expiresIn || 300,
		otpLength: options?.otpLength || 6,
	};
	return {
		id: "phone-number",
		endpoints: {
			sendPhoneNumberOTP: createAuthEndpoint(
				"/phone-number/send-otp",
				{
					method: "POST",
					body: z.object({
						phoneNumber: z.string(),
					}),
				},
				async (ctx) => {
					if (!options?.sendOTP) {
						logger.warn("sendOTP not implemented");
						throw new APIError("NOT_IMPLEMENTED", {
							message: "sendOTP not implemented",
						});
					}
					const code = generateOTP(opts.otpLength);
					await ctx.context.internalAdapter.createVerificationValue({
						value: code,
						identifier: ctx.body.phoneNumber,
						expiresAt: getDate(opts.expiresIn, "sec"),
					});
					await options.sendOTP(ctx.body.phoneNumber, code);
					return ctx.json(
						{ code },
						{
							body: {
								message: "Code sent",
							},
						},
					);
				},
			),
			verifyPhoneNumber: createAuthEndpoint(
				"/phone-number/verify",
				{
					method: "POST",
					body: z.object({
						/**
						 * Phone number
						 */
						phoneNumber: z.string(),
						/**
						 * OTP code
						 */
						code: z.string(),
						/**
						 * Disable session creation after verification
						 * @default false
						 */
						disableSession: z.boolean().optional(),
						/**
						 * This checks if there is a session already
						 * and updates the phone number with the provided
						 * phone number
						 */
						updatePhoneNumber: z.boolean().optional(),
					}),
				},
				async (ctx) => {
					const otp = await ctx.context.internalAdapter.findVerificationValue(
						ctx.body.phoneNumber,
					);

					if (!otp || otp.expiresAt < new Date()) {
						if (otp && otp.expiresAt < new Date()) {
							await ctx.context.internalAdapter.deleteVerificationValue(otp.id);
							throw new APIError("BAD_REQUEST", {
								message: "OTP expired",
							});
						}
						throw new APIError("BAD_REQUEST", {
							message: "OTP not found",
						});
					}
					if (otp.value !== ctx.body.code) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OTP",
						});
					}
					await ctx.context.internalAdapter.deleteVerificationValue(otp.id);

					if (ctx.body.updatePhoneNumber) {
						const session = await getSessionFromCtx(ctx);
						if (!session) {
							throw new APIError("UNAUTHORIZED", {
								message: "Session not found",
							});
						}
						const user = await ctx.context.internalAdapter.updateUser(
							session.user.id,
							{
								[opts.phoneNumber]: ctx.body.phoneNumber,
								[opts.phoneNumberVerified]: true,
							},
						);
						return ctx.json({
							user: user as UserWithPhoneNumber,
							session: session.session,
						});
					}

					let user = await ctx.context.adapter.findOne<User>({
						model: ctx.context.tables.user.tableName,
						where: [
							{
								value: ctx.body.phoneNumber,
								field: opts.phoneNumber,
							},
						],
					});
					if (!user) {
						if (options?.signUpOnVerification) {
							user = await ctx.context.internalAdapter.createUser({
								email: options.signUpOnVerification.getTempEmail(
									ctx.body.phoneNumber,
								),
								name: options.signUpOnVerification.getTempName
									? options.signUpOnVerification.getTempName(
											ctx.body.phoneNumber,
										)
									: ctx.body.phoneNumber,
								[opts.phoneNumber]: ctx.body.phoneNumber,
								[opts.phoneNumberVerified]: true,
							});
							if (!user) {
								throw new APIError("INTERNAL_SERVER_ERROR", {
									message: "Failed to create user",
								});
							}
						} else {
							throw new APIError("BAD_REQUEST", {
								message: "Phone number not found",
							});
						}
					} else {
						user = await ctx.context.internalAdapter.updateUser(user.id, {
							[opts.phoneNumberVerified]: true,
						});
					}

					if (!user) {
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Failed to update user",
						});
					}

					if (!ctx.body.disableSession) {
						const session = await ctx.context.internalAdapter.createSession(
							user.id,
							ctx.request,
						);
						if (!session) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Failed to create session",
							});
						}
						await setSessionCookie(ctx, {
							session,
							user,
						});
						return ctx.json({
							user,
							session,
						});
					}

					return ctx.json({
						user,
						session: null,
					});
				},
			),
		},
		schema: {
			user: {
				fields: {
					phoneNumber: {
						type: "string",
						required: false,
						unique: true,
						returned: true,
					},
					phoneNumberVerified: {
						type: "boolean",
						required: false,
						returned: true,
						input: false,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
};
