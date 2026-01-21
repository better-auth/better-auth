import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod";
import { setSessionCookie } from "../../../cookies";
import {
	constantTimeEqual,
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../../crypto";
import { parseUserOutput } from "../../../db/schema";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import type { TwoFactorProvider, UserWithTwoFactor } from "../types";
import { defaultKeyHasher } from "../utils";
import { verifyTwoFactor } from "../verify-two-factor";

export type OTPMethod = "email" | "phone";

export type SendOTPData = {
	user: UserWithTwoFactor;
	otp: string;
};

export type SendOTPFn = (
	data: SendOTPData,
	ctx?: GenericEndpointContext,
) => Awaitable<void>;

export interface OTPOptions {
	/**
	 * How long the opt will be valid for in
	 * minutes
	 *
	 * @default "3 mins"
	 */
	period?: number | undefined;
	/**
	 * Number of digits for the OTP code
	 *
	 * @default 6
	 */
	digits?: number | undefined;
	/**
	 * Send the otp to the user (used as fallback if sendEmailOTP/sendPhoneOTP are not provided)
	 *
	 * @param user - The user to send the otp to
	 * @param otp - The otp to send
	 * @param request - The request object
	 * @returns void | Promise<void>
	 * @deprecated Use `sendEmailOTP` or `sendPhoneOTP` instead for more explicit OTP delivery methods
	 */
	sendOTP?: SendOTPFn | undefined;
	/**
	 * Send the otp to the user via email
	 *
	 * @param data - Object containing the user and the otp
	 * @param ctx - The request context
	 * @returns void | Promise<void>
	 */
	sendEmailOTP?: SendOTPFn | undefined;
	/**
	 * Send the otp to the user via phone (SMS)
	 *
	 * @param data - Object containing the user and the otp
	 * @param ctx - The request context
	 * @returns void | Promise<void>
	 */
	sendPhoneOTP?: SendOTPFn | undefined;
	/**
	 * The number of allowed attempts for the OTP
	 *
	 * @default 5
	 */
	allowedAttempts?: number | undefined;
	storeOTP?:
		| (
				| "plain"
				| "encrypted"
				| "hashed"
				| { hash: (token: string) => Promise<string> }
				| {
						encrypt: (token: string) => Promise<string>;
						decrypt: (token: string) => Promise<string>;
				  }
		  )
		| undefined;
}

const verifyOTPBodySchema = z.object({
	code: z.string().meta({
		description: 'The otp code to verify. Eg: "012345"',
	}),
	/**
	 * if true, the device will be trusted
	 * for 30 days. It'll be refreshed on
	 * every sign in request within this time.
	 */
	trustDevice: z.boolean().optional().meta({
		description:
			"If true, the device will be trusted for 30 days. It'll be refreshed on every sign in request within this time. Eg: true",
	}),
});

const send2FaOTPBodySchema = z.object({
	/**
	 * The method to send the OTP
	 * @default "email"
	 */
	method: z.enum(["email", "phone"]).optional().default("email").meta({
		description:
			'The method to use for sending the OTP. Can be "email" or "phone". Defaults to "email".',
	}),
	/**
	 * if true, the device will be trusted
	 * for 30 days. It'll be refreshed on
	 * every sign in request within this time.
	 */
	trustDevice: z.boolean().optional().meta({
		description:
			"If true, the device will be trusted for 30 days. It'll be refreshed on every sign in request within this time. Eg: true",
	}),
});

/**
 * The otp adapter is created from the totp adapter.
 */
export const otp2fa = (options?: OTPOptions | undefined) => {
	const opts = {
		storeOTP: "plain",
		digits: 6,
		...options,
		period: (options?.period || 3) * 60 * 1000,
	};

	async function storeOTP(ctx: GenericEndpointContext, otp: string) {
		if (opts.storeOTP === "hashed") {
			return await defaultKeyHasher(otp);
		}
		if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
			return await opts.storeOTP.hash(otp);
		}
		if (typeof opts.storeOTP === "object" && "encrypt" in opts.storeOTP) {
			return await opts.storeOTP.encrypt(otp);
		}
		if (opts.storeOTP === "encrypted") {
			return await symmetricEncrypt({
				key: ctx.context.secret,
				data: otp,
			});
		}
		return otp;
	}

	async function decryptOTP(ctx: GenericEndpointContext, otp: string) {
		if (opts.storeOTP === "hashed") {
			return await defaultKeyHasher(otp);
		}
		if (opts.storeOTP === "encrypted") {
			return await symmetricDecrypt({
				key: ctx.context.secret,
				data: otp,
			});
		}
		if (typeof opts.storeOTP === "object" && "encrypt" in opts.storeOTP) {
			return await opts.storeOTP.decrypt(otp);
		}
		if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
			return await opts.storeOTP.hash(otp);
		}
		return otp;
	}

	/**
	 * Get the appropriate send function based on the method
	 */
	function getSendOTPFunction(method: OTPMethod): SendOTPFn | undefined {
		if (method === "email") {
			return options?.sendEmailOTP ?? options?.sendOTP;
		}
		if (method === "phone") {
			return options?.sendPhoneOTP ?? options?.sendOTP;
		}
		return options?.sendOTP;
	}

	/**
	 * Generate OTP and send it to the user.
	 */
	const send2FaOTP = createAuthEndpoint(
		"/two-factor/send-otp",
		{
			method: "POST",
			body: send2FaOTPBodySchema,
			metadata: {
				openapi: {
					summary: "Send two factor OTP",
					description:
						"Send two factor OTP to the user via email or phone based on the specified method",
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
			const method = ctx.body?.method ?? "email";
			const sendOTPFn = getSendOTPFunction(method);

			if (!sendOTPFn) {
				const methodName = method === "email" ? "sendEmailOTP" : "sendPhoneOTP";
				ctx.context.logger.error(
					`send otp isn't configured for method "${method}". Please configure the ${methodName} function on otp options.`,
				);
				throw APIError.from("BAD_REQUEST", {
					message: `otp isn't configured for method "${method}"`,
					code: "OTP_NOT_CONFIGURED",
				});
			}

			const { session, key } = await verifyTwoFactor(ctx);
			const code = generateRandomString(opts.digits, "0-9");
			const hashedCode = await storeOTP(ctx, code);
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${hashedCode}:0`,
				identifier: `2fa-otp-${key}`,
				expiresAt: new Date(Date.now() + opts.period),
			});
			const sendOTPResult = sendOTPFn(
				{ user: session.user as UserWithTwoFactor, otp: code },
				ctx,
			);
			if (sendOTPResult instanceof Promise) {
				await ctx.context.runInBackgroundOrAwait(
					sendOTPResult.catch((e: unknown) => {
						ctx.context.logger.error(
							`Failed to send two-factor OTP via ${method}`,
							e,
						);
					}),
				);
			}
			return ctx.json({ status: true });
		},
	);

	const verifyOTP = createAuthEndpoint(
		"/two-factor/verify-otp",
		{
			method: "POST",
			body: verifyOTPBodySchema,
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
			const toCheckOtp =
				await ctx.context.internalAdapter.findVerificationValue(
					`2fa-otp-${key}`,
				);
			const [otp, counter] = toCheckOtp?.value?.split(":") ?? [];
			const decryptedOtp = await decryptOTP(ctx, otp!);
			if (!toCheckOtp || toCheckOtp.expiresAt < new Date()) {
				if (toCheckOtp) {
					await ctx.context.internalAdapter.deleteVerificationValue(
						toCheckOtp.id,
					);
				}
				throw APIError.from(
					"BAD_REQUEST",
					TWO_FACTOR_ERROR_CODES.OTP_HAS_EXPIRED,
				);
			}
			const allowedAttempts = options?.allowedAttempts || 5;
			if (parseInt(counter!) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationValue(
					toCheckOtp.id,
				);
				throw APIError.from(
					"BAD_REQUEST",
					TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
				);
			}
			const isCodeValid = constantTimeEqual(
				new TextEncoder().encode(decryptedOtp),
				new TextEncoder().encode(ctx.body.code),
			);
			if (isCodeValid) {
				if (!session.user.twoFactorEnabled) {
					if (!session.session) {
						throw APIError.from(
							"BAD_REQUEST",
							BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
						);
					}
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						session.user.id,
						{
							twoFactorEnabled: true,
						},
					);
					const newSession = await ctx.context.internalAdapter.createSession(
						session.user.id,
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
						user: parseUserOutput(ctx.context.options, updatedUser),
					});
				}
				return valid(ctx);
			} else {
				await ctx.context.internalAdapter.updateVerificationValue(
					toCheckOtp.id,
					{
						value: `${otp}:${(parseInt(counter!, 10) || 0) + 1}`,
					},
				);
				return invalid("INVALID_CODE");
			}
		},
	);

	return {
		id: "otp",
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/send-otp`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.send2FaOTP`
			 *
			 * **client:**
			 * `authClient.twoFactor.sendOtp`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#api-method-two-factor-send-otp)
			 */
			sendTwoFactorOTP: send2FaOTP,
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/verify-otp`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.verifyOTP`
			 *
			 * **client:**
			 * `authClient.twoFactor.verifyOtp`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/2fa#api-method-two-factor-verify-otp)
			 */
			verifyTwoFactorOTP: verifyOTP,
		},
	} satisfies TwoFactorProvider;
};
