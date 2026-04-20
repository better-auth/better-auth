import type { Awaitable, GenericEndpointContext } from "@better-auth/core";
import { BUILTIN_AMR_METHOD } from "@better-auth/core";
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
import type { TwoFactorProvider, UserWithTwoFactor } from "../types";
import { defaultKeyHasher } from "../utils";
import { verifyTwoFactor } from "../verify-two-factor";

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
	attemptId: z.string().optional().meta({
		description:
			"Opaque identifier for a paused sign-in attempt. Required when verifying a sign-in attempt without relying on the two-factor cookie.",
	}),
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
		attemptId: z.string().optional().meta({
			description:
				"Opaque identifier for a paused sign-in attempt. Required when sending an OTP for a sign-in attempt without relying on the two-factor cookie.",
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
			const resolver = await verifyTwoFactor(ctx);
			const { session, key } = resolver;
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
			const resolver = await verifyTwoFactor(ctx);
			const { session, key } = resolver;
			const invalid = resolver.invalid;
			const toCheckOtp =
				await ctx.context.internalAdapter.findVerificationValue(
					`2fa-otp-${key}`,
				);
			const [otp, counter] = toCheckOtp?.value?.split(":") ?? [];
			if (!toCheckOtp || toCheckOtp.expiresAt < new Date()) {
				if (toCheckOtp) {
					await ctx.context.internalAdapter.deleteVerificationByIdentifier(
						`2fa-otp-${key}`,
					);
				}
				throw APIError.from(
					"BAD_REQUEST",
					TWO_FACTOR_ERROR_CODES.OTP_HAS_EXPIRED,
				);
			}
			const allowedAttempts = options?.allowedAttempts || 5;
			if (parseInt(counter!) >= allowedAttempts) {
				await ctx.context.internalAdapter.deleteVerificationByIdentifier(
					`2fa-otp-${key}`,
				);
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
			const user = session.user as UserWithTwoFactor;
			if (isCodeValid) {
				if (!user.twoFactorEnabled) {
					if (resolver.mode !== "session") {
						throw APIError.from(
							"BAD_REQUEST",
							BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
						);
					}
					const activeSession = resolver.session.session;
					const updatedUser = await ctx.context.internalAdapter.updateUser(
						user.id,
						{
							twoFactorEnabled: true,
						},
					);
					const newSession = await ctx.context.internalAdapter.createSession(
						user.id,
						false,
					);
					await setSessionCookie(ctx, {
						session: newSession,
						user: updatedUser,
					});
					await ctx.context.internalAdapter.deleteSession(activeSession.token);
					return ctx.json({
						token: newSession.token,
						user: parseUserOutput(ctx.context.options, updatedUser),
					});
				}
				if (resolver.mode === "finalize") {
					return resolver.valid(ctx, {
						method: BUILTIN_AMR_METHOD.OTP,
						factor: "possession",
						completedAt: new Date(),
					});
				}
				return resolver.valid(ctx);
			} else {
				// Concurrent bad-code submissions would race a plain
				// read-modify-write, collapsing increments so the OTP-scoped
				// lockout could drift below the configured `allowedAttempts`.
				// CAS on the stored value; on conflict, re-read and recompute
				// up to a bounded number of retries. The attempt-level counter
				// (recordSignInAttemptFailure) is the authoritative limiter,
				// but this per-OTP counter is reached in management-mode
				// enrollment where there is no attempt, so it must be correct
				// on its own.
				const identifier = `2fa-otp-${key}`;
				const MAX_CAS_RETRIES = 5;
				let latest = toCheckOtp!;
				for (let i = 0; i < MAX_CAS_RETRIES; i++) {
					const [currentOtp, currentCounter] = latest.value.split(":");
					const nextValue = `${currentOtp}:${
						(parseInt(currentCounter!, 10) || 0) + 1
					}`;
					const applied =
						await ctx.context.internalAdapter.casUpdateVerificationValue(
							identifier,
							latest.value,
							nextValue,
						);
					if (applied) break;
					const reread =
						await ctx.context.internalAdapter.findVerificationValue(identifier);
					if (!reread) break;
					latest = reread;
				}
				return invalid("INVALID_CODE");
			}
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
