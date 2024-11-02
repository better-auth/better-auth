import { describe, it, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { emailOTP } from ".";
import { emailOTPClient } from "./client";

describe("email-otp", async () => {
	const otpFn = vi.fn();
	let otp = "";
	const { client, testUser } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP({ email, otp: _otp, type }) {
						otp = _otp;
						otpFn(email, _otp, type);
					},
					sendVerificationOnSignUp: true,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [emailOTPClient()],
			},
		},
	);

	it("should verify email with otp", async () => {
		const res = await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		expect(res.data?.success).toBe(true);
		expect(otp.length).toBe(6);
		expect(otpFn).toHaveBeenCalledWith(
			testUser.email,
			otp,
			"email-verification",
		);
		const verifiedUser = await client.emailOtp.verifyEmail({
			email: testUser.email,
			otp,
		});
		expect(verifiedUser.data?.user.emailVerified).toBe(true);
	});

	it("should sign-in with otp", async () => {
		const res = await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "sign-in",
		});
		expect(res.data?.success).toBe(true);
		expect(otp.length).toBe(6);
		expect(otpFn).toHaveBeenCalledWith(testUser.email, otp, "sign-in");
		const verifiedUser = await client.signIn.emailOtp(
			{
				email: testUser.email,
				otp,
			},
			{
				onSuccess: (ctx) => {
					const header = ctx.response.headers.get("set-cookie");
					expect(header).toContain("better-auth.session_token");
				},
			},
		);

		expect(verifiedUser.data?.session).toBeDefined();
	});

	it("should send verification otp on sign-up", async () => {
		const testUser2 = {
			email: "test@email.com",
			password: "password",
			name: "test",
		};
		await client.signUp.email(testUser2);
		expect(otpFn).toHaveBeenCalledWith(
			testUser2.email,
			otp,
			"email-verification",
		);
	});
});

describe("email-otp-verify", async () => {
	const otpFn = vi.fn();
	const otp = [""];
	const { client, testUser } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP({ email, otp: _otp, type }) {
						otp.push(_otp);
						otpFn(email, _otp, type);
					},
					sendVerificationOnSignUp: true,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [emailOTPClient()],
			},
		},
	);

	it("should verify email with last otp", async () => {
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		const verifiedUser = await client.emailOtp.verifyEmail({
			email: testUser.email,
			otp: otp.pop() as string,
		});
		expect(verifiedUser.data?.user.emailVerified).toBe(true);
	});
});
