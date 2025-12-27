import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../../cookies";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import {
	enableTwoFactor,
	generateTOTPCode,
	getTwoFactorSecret,
	initiateTwoFactorFlow,
	setupTwoFactorTest,
	signInUser,
} from "./two-factor-test-utils";

describe("Two Factor Security Features", () => {
	describe("OTP Rate Limiting", () => {
		it("should limit OTP verification attempts", async () => {
			const context = await setupTwoFactorTest();
			const { session, headers } = await signInUser(context);

			await enableTwoFactor(context, headers);
			const secret = await getTwoFactorSecret(context, session.user.id);
			const totpCode = await generateTOTPCode(secret);

			await context.client.twoFactor.verifyTotp({
				code: totpCode,
				fetchOptions: { headers },
			});

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});

			for (let i = 0; i < 5; i++) {
				const result = await context.client.twoFactor.verifyOtp({
					code: "000000",
					fetchOptions: { headers: flowHeaders },
				});
				expect(result.error?.message).toBe("Invalid code");
			}

			const finalResult = await context.client.twoFactor.verifyOtp({
				code: context.capturedOTP!,
				fetchOptions: { headers: flowHeaders },
			});

			expect(finalResult.error?.message).toBe(
				"Too many attempts. Please request a new code.",
			);
		});

		it("should reset attempt counter after new OTP request", async () => {
			const context = await setupTwoFactorTest();
			const { session, headers } = await signInUser(context);

			await enableTwoFactor(context, headers);
			const secret = await getTwoFactorSecret(context, session.user.id);
			const totpCode = await generateTOTPCode(secret);

			await context.client.twoFactor.verifyTotp({
				code: totpCode,
				fetchOptions: { headers },
			});

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});

			for (let i = 0; i < 3; i++) {
				await context.client.twoFactor.verifyOtp({
					code: "000000",
					fetchOptions: { headers: flowHeaders },
				});
			}

			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});

			const result = await context.client.twoFactor.verifyOtp({
				code: context.capturedOTP,
				fetchOptions: { headers: flowHeaders },
			});

			expect(result.data?.token).toBeDefined();
		});
	});

	describe("OTP Expiration", () => {
		it("should expire OTP after configured period", async () => {
			const context = await setupTwoFactorTest({
				otpOptions: { period: 0.01 },
			});

			const { session, headers } = await signInUser(context);
			await enableTwoFactor(context, headers);
			const secret = await getTwoFactorSecret(context, session.user.id);
			const totpCode = await generateTOTPCode(secret);

			await context.client.twoFactor.verifyTotp({
				code: totpCode,
				fetchOptions: { headers },
			});

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});

			const capturedOTP = context.capturedOTP;

			await new Promise((resolve) => setTimeout(resolve, 1000));

			const result = await context.client.twoFactor.verifyOtp({
				code: capturedOTP,
				fetchOptions: { headers: flowHeaders },
			});

			expect(result.error?.message).toBe(
				TWO_FACTOR_ERROR_CODES.OTP_HAS_EXPIRED.message,
			);
		});
	});

	describe("Invalid Codes", () => {
		it("should reject invalid TOTP codes", async () => {
			const context = await setupTwoFactorTest();
			const { headers } = await signInUser(context);

			await enableTwoFactor(context, headers);

			const invalidCodes = ["", "12345", "1234567", "abcdef", "123abc"];

			for (const code of invalidCodes) {
				const result = await context.client.twoFactor.verifyTotp({
					code,
					fetchOptions: { headers },
				});
				expect(result.error?.message).toBe(
					TWO_FACTOR_ERROR_CODES.INVALID_CODE.message,
				);
			}
		});

		it("should reject empty or malformed OTP codes", async () => {
			const context = await setupTwoFactorTest();
			const { session, headers } = await signInUser(context);

			await enableTwoFactor(context, headers);
			const secret = await getTwoFactorSecret(context, session.user.id);
			const totpCode = await generateTOTPCode(secret);

			await context.client.twoFactor.verifyTotp({
				code: totpCode,
				fetchOptions: { headers },
			});

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});

			const invalidCodes = ["", "12345", "1234567", "abcdef", "123abc"];

			for (const code of invalidCodes) {
				const result = await context.client.twoFactor.verifyOtp({
					code,
					fetchOptions: { headers: flowHeaders },
				});
				expect(result.error?.message).toBe("Invalid code");
			}
		});
	});

	describe("Session Security", () => {
		it("should clear two factor cookie after successful verification", async () => {
			const context = await setupTwoFactorTest({
				skipVerificationOnEnable: true,
			});
			const { headers } = await signInUser(context);

			await enableTwoFactor(context, headers);

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});

			let twoFactorCookieCleared = false;
			const result = await context.client.twoFactor.verifyOtp({
				code: context.capturedOTP,
				fetchOptions: {
					headers: flowHeaders,
					onSuccess(ctx) {
						const parsed = parseSetCookieHeader(
							ctx.response.headers.get("Set-Cookie") || "",
						);
						const twoFactorCookie = parsed.get("better-auth.two_factor");
						twoFactorCookieCleared = twoFactorCookie?.value === "";
					},
				},
			});

			expect(result.data?.token).toBeDefined();
			expect(twoFactorCookieCleared).toBe(true);
		});

		it("should not create session without proper two factor verification", async () => {
			const context = await setupTwoFactorTest();
			const { session, headers } = await signInUser(context);

			await enableTwoFactor(context, headers);
			const secret = await getTwoFactorSecret(context, session.user.id);
			const totpCode = await generateTOTPCode(secret);

			await context.client.twoFactor.verifyTotp({
				code: totpCode,
				fetchOptions: { headers },
			});

			const signInResult = await context.client.signIn.email({
				email: context.testUser.email,
				password: context.testUser.password,
			});

			// @ts-expect-error - twoFactorRedirect is not defined in the type
			expect(signInResult.data?.twoFactorRedirect).toBe(true);
			expect(signInResult.data?.user).toBeUndefined();
		});
	});

	describe("Configuration Validation", () => {
		it("should handle missing OTP configuration gracefully", async () => {
			const context = await setupTwoFactorTest({
				otpOptions: undefined,
			});

			const { session, headers } = await signInUser(context);
			await enableTwoFactor(context, headers);
			const secret = await getTwoFactorSecret(context, session.user.id);
			const totpCode = await generateTOTPCode(secret);

			await context.client.twoFactor.verifyTotp({
				code: totpCode,
				fetchOptions: { headers },
			});

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			const result = await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});

			expect(result.error?.code).toBe("OTP_NOT_CONFIGURED");
		});
	});
});
