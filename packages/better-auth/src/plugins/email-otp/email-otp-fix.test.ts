import { describe, it, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { emailOTP } from ".";
import { emailOTPClient } from "./client";
import { bearer } from "../bearer";

/**
 * generateOTP should receive correct `type` during sign-up flow
 */
describe("sendVerificationOnSignUp generateOTP bug", async () => {
	let capturedGenerateOTPParams: any[] = [];
	const mockGenerateOTP = vi.fn((data, request) => {
		capturedGenerateOTPParams.push(data);
		return "123456";
	});

	const { client } = await getTestInstance(
		{
			plugins: [
				bearer(),
				emailOTP({
					async sendVerificationOTP({ email, otp, type }) {},
					sendVerificationOnSignUp: true,
					generateOTP: mockGenerateOTP,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [emailOTPClient()],
			},
		},
	);

	it("should pass correct type to generateOTP when signing up", async () => {
		const testUser = {
			email: "test-signup@domain.com",
			password: "password",
			name: "test",
		};

		await client.signUp.email(testUser);

		expect(mockGenerateOTP).toHaveBeenCalled();

		const lastCall =
			capturedGenerateOTPParams[capturedGenerateOTPParams.length - 1];
		console.log("generateOTP called with:", lastCall);

		expect(lastCall.type).toBe("email-verification"); // 👈
		expect(lastCall.email).toBe(testUser.email);
	});
});

/**
 * When disableSignUp is true,
 * the server should return an API error for unknown users instead of sending OTP
 */
describe("disableSignUp OTP sending bug", async () => {
	const otpFn = vi.fn();
	let sentOTP = "";

	const { client, auth } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP({ email, otp, type }) {
						sentOTP = otp;
						otpFn(email, otp, type);
					},
					disableSignUp: true,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [emailOTPClient()],
			},
		},
	);

	it("should NOT send OTP to non-existent user when disableSignUp is true", async () => {
		const nonExistentEmail = "nonexistent@domain.com";

		const res = await client.emailOtp.sendVerificationOtp({
			email: nonExistentEmail,
			type: "email-verification",
		});

		console.log("Response:", res);

		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("USER_NOT_FOUND");

		expect(otpFn).not.toHaveBeenCalledWith(
			nonExistentEmail,
			expect.any(String),
			"email-verification",
		);

		const storedOTP = await auth.api.getVerificationOTP({
			query: {
				email: nonExistentEmail,
				type: "email-verification",
			},
		});
		expect(storedOTP.otp).toBeNull();
	});

	it("should send OTP to existing user when disableSignUp is true", async () => {
		const ctx = await auth.$context;
		await ctx.internalAdapter.createUser({
			email: "existing@domain.com",
			name: "test",
			emailVerified: false,
		});

		const testUser = {
			email: "existing@domain.com",
			password: "password",
			name: "test",
		};

		const res = await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});

		expect(res.data?.success).toBe(true);
		expect(otpFn).toHaveBeenCalledWith(
			testUser.email,
			expect.any(String),
			"email-verification",
		);
	});
});

/**
 * forget-password vs email-verification
 * forget-password should behave differently for security
 */
describe("forget-password vs email-verification behavior", async () => {
	const otpFn = vi.fn();

	const { client } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP({ email, otp, type }) {
						otpFn(email, otp, type);
					},
					disableSignUp: true,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [emailOTPClient()],
			},
		},
	);

	it("should return success for non-existent user with forget-password (security)", async () => {
		const nonExistentEmail = "nonexistent@domain.com";

		const res = await client.emailOtp.sendVerificationOtp({
			email: nonExistentEmail,
			type: "forget-password",
		});

		expect(res.data?.success).toBe(true);
		expect(otpFn).not.toHaveBeenCalledWith(
			nonExistentEmail,
			expect.any(String),
			"forget-password",
		);
	});

	it("should fail for non-existent user with email-verification when disableSignUp is true", async () => {
		const nonExistentEmail = "nonexistent2@domain.com";

		const res = await client.emailOtp.sendVerificationOtp({
			email: nonExistentEmail,
			type: "email-verification",
		});

		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("USER_NOT_FOUND");
	});
});

/**
 * sign-in should fail with invalid OTP for unknown users
 */
describe("edge cases not covered in existing tests", async () => {
	const { client, testUser } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP({ email, otp, type }) {},
					disableSignUp: true,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [emailOTPClient()],
			},
		},
	);

	it("should handle sign-in OTP for non-existent user when disableSignUp is true", async () => {
		const nonExistentEmail = "new-user@domain.com";

		await client.emailOtp.sendVerificationOtp({
			email: nonExistentEmail,
			type: "sign-in",
		});

		const res = await client.signIn.emailOtp({
			email: nonExistentEmail,
			otp: "123456",
		});

		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("INVALID_OTP");
	});
});
