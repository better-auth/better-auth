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
import { PACKAGE_VERSION } from "../../../version";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import type {
	TwoFactorProvider,
	TwoFactorTable,
	UserWithTwoFactor,
} from "../types";
import { defaultKeyHasher } from "../utils";
import {
	assertTwoFactorNotLocked,
	recordTwoFactorFailure,
	resetTwoFactorFailures,
	verifyTwoFactor,
} from "../verify-two-factor";

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
	 * Send the otp to the user
	 *
	 * @param user - The user to send the otp to
	 * @param otp - The otp to send
	 * @param request - The request object
	 * @returns void | Promise<void>
	 */
	sendOTP?:
		| ((
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
				ctx?: GenericEndpointContext,
		  ) => Awaitable<void>)
		| undefined;
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

const send2FaOTPBodySchema = z
	.object({
		/**
		 * if true, the device will be trusted
		 * for 30 days. It'll be refreshed on
		 * every sign in request within this time.
		 */
		trustDevice: z.boolean().optional().meta({
			description:
				"If true, the device will be trusted for 30 days. It'll be refreshed on every sign in request within this time. Eg: true",
		}),
	})
	.optional();

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
				key: ctx.context.secretConfig,
				data: otp,
			});
		}
		return otp;
	}

	async function decryptOrHashForComparison(
		ctx: GenericEndpointContext,
		storedOtp: string,
		userInput: string,
	): Promise<[string, string]> {
		if (opts.storeOTP === "hashed") {
			// For hashed storage: hash the user input and compare with stored hash
			return [storedOtp, await defaultKeyHasher(userInput)];
		}
		if (opts.storeOTP === "encrypted") {
			// For encrypted storage: decrypt stored value and compare with plain input
			const decrypted = await symmetricDecrypt({
				key: ctx.context.secretConfig,
				data: storedOtp,
			});
			return [decrypted, userInput];
		}
		if (typeof opts.storeOTP === "object" && "encrypt" in opts.storeOTP) {
			const decrypted = await opts.storeOTP.decrypt(storedOtp);
			return [decrypted, userInput];
		}
		if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP) {
			// For custom hash: hash the user input and compare with stored hash
			return [storedOtp, await opts.storeOTP.hash(userInput)];
		}
		// Plain storage: compare directly
		return [storedOtp, userInput];
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
				throw APIError.from("BAD_REQUEST", {
					message: "otp isn't configured",
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
			const sendOTPResult = options.sendOTP(
				{ user: session.user as UserWithTwoFactor, otp: code },
				ctx,
			);
			if (sendOTPResult instanceof Promise) {
				await ctx.context.runInBackgroundOrAwait(
					sendOTPResult.catch((e: unknown) => {
						ctx.context.logger.error("Failed to send two-factor OTP", e);
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
			const isSignIn = !session.session;
			const twoFactorTable = "twoFactor";
			// Account-level lockout shares one counter across all factors, so OTP
			// failures count toward and are blocked by the same lock as TOTP and
			// backup codes. Fail closed on a sign-in if the record is missing.
			let twoFactor: TwoFactorTable | null = null;
			if (isSignIn) {
				twoFactor = await ctx.context.adapter.findOne<TwoFactorTable>({
					model: twoFactorTable,
					where: [{ field: "userId", value: session.user.id }],
				});
				if (!twoFactor) {
					throw APIError.from(
						"BAD_REQUEST",
						TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
					);
				}
				await assertTwoFactorNotLocked(ctx, twoFactorTable, twoFactor);
			}
			// Consume the OTP row atomically as the race gate. The first concurrent
			// submission wins the row; every other racer receives null and is
			// rejected, so a burst of guesses cannot all read the same attempt
			// counter before any write lands. Expiry is gated inside the consume,
			// so a stale row returns null without minting a session.
			const consumed =
				await ctx.context.internalAdapter.consumeVerificationValue(
					`2fa-otp-${key}`,
				);
			if (!consumed) {
				throw APIError.from(
					"BAD_REQUEST",
					TWO_FACTOR_ERROR_CODES.OTP_HAS_EXPIRED,
				);
			}
			const [otp, counter] = consumed.value?.split(":") ?? [];
			const allowedAttempts = options?.allowedAttempts || 5;
			const attempts = parseInt(counter!, 10) || 0;
			if (attempts >= allowedAttempts) {
				// The budget is spent. The row stays consumed, so the next
				// submission is rejected as expired/already-consumed.
				throw APIError.from(
					"BAD_REQUEST",
					TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
				);
			}
			const [storedValue, inputValue] = await decryptOrHashForComparison(
				ctx,
				otp!,
				ctx.body.code,
			);
			const isCodeValid = constantTimeEqual(
				new TextEncoder().encode(storedValue),
				new TextEncoder().encode(inputValue),
			);
			if (isCodeValid) {
				if (twoFactor) {
					await resetTwoFactorFailures(ctx, twoFactorTable, twoFactor);
				}
				// Leave the row consumed: a valid OTP is single-use.
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
					await setSessionCookie(ctx, {
						session: newSession,
						user: updatedUser,
					});
					await ctx.context.internalAdapter.deleteSession(
						session.session.token,
					);
					return ctx.json({
						token: newSession.token,
						user: parseUserOutput(ctx.context.options, updatedUser),
					});
				}
				return valid(ctx);
			}
			// Wrong code within budget: re-arm the row with the incremented counter
			// and the original expiry. The recreated counter is the durable record
			// of the attempt, so the next submission either keeps guessing or hits
			// the lock-out guard above. The original expiry caps the whole burst.
			await ctx.context.internalAdapter.createVerificationValue({
				value: `${otp}:${attempts + 1}`,
				identifier: `2fa-otp-${key}`,
				expiresAt: consumed.expiresAt,
			});
			if (twoFactor) {
				await recordTwoFactorFailure(ctx, twoFactorTable, twoFactor);
			}
			return invalid("INVALID_CODE");
		},
	);

	return {
		id: "otp",
		version: PACKAGE_VERSION,
		endpoints: {
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/send-otp`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.sendTwoFactorOTP`
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
			 * `auth.api.verifyTwoFactorOTP`
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
