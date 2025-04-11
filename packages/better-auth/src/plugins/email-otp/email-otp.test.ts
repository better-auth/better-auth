import { describe, it, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { emailOTP } from ".";
import { emailOTPClient } from "./client";
import { bearer } from "../bearer";

describe("email-otp", async () => {
	const otpFn = vi.fn();
	let otp = "";
	const { client, testUser, auth } = await getTestInstance(
		{
			plugins: [
				bearer(),
				emailOTP({
					async sendVerificationOTP({ email, otp: _otp, type }) {
						otp = _otp;
						otpFn(email, _otp, type);
					},
					sendVerificationOnSignUp: true,
				}),
			],
			emailVerification: {
				autoSignInAfterVerification: true,
			},
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
		expect(verifiedUser.data?.status).toBe(true);
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
		expect(verifiedUser.data?.token).toBeDefined();
	});

	it("should sign-up with otp", async () => {
		const testUser2 = {
			email: "test-email@domain.com",
		};
		await client.emailOtp.sendVerificationOtp({
			email: testUser2.email,
			type: "sign-in",
		});
		const newUser = await client.signIn.emailOtp(
			{
				email: testUser2.email,
				otp,
			},
			{
				onSuccess: (ctx) => {
					const header = ctx.response.headers.get("set-cookie");
					expect(header).toContain("better-auth.session_token");
				},
			},
		);
		expect(newUser.data?.token).toBeDefined();
	});

	it("should send verification otp on sign-up", async () => {
		const testUser2 = {
			email: "test8@email.com",
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

	it("should send forget password otp", async () => {
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "forget-password",
		});
	});

	it("should reset password", async () => {
		await client.emailOtp.resetPassword({
			email: testUser.email,
			otp,
			password: "changed-password",
		});
		const { data } = await client.signIn.email({
			email: testUser.email,
			password: "changed-password",
		});
		expect(data?.user).toBeDefined();
	});

	it("should reset password and create credential account", async () => {
		const testUser2 = {
			email: "test-email@domain.com",
		};
		await client.emailOtp.sendVerificationOtp({
			email: testUser2.email,
			type: "sign-in",
		});
		await client.signIn.emailOtp(
			{
				email: testUser2.email,
				otp,
			},
			{
				onSuccess: (ctx) => {
					const header = ctx.response.headers.get("set-cookie");
					expect(header).toContain("better-auth.session_token");
				},
			},
		);
		await client.emailOtp.sendVerificationOtp({
			email: testUser2.email,
			type: "forget-password",
		});
		await client.emailOtp.resetPassword({
			email: testUser2.email,
			otp,
			password: "password",
		});
		const res = await client.signIn.email({
			email: testUser2.email,
			password: "password",
		});
		expect(res.data?.token).toBeDefined();
	});

	it("should fail on invalid email", async () => {
		const res = await client.emailOtp.sendVerificationOtp({
			email: "invalid-email",
			type: "email-verification",
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("INVALID_EMAIL");
	});

	it("should fail on expired otp", async () => {
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 5);
		const res = await client.emailOtp.verifyEmail({
			email: testUser.email,
			otp,
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("OTP_EXPIRED");
	});

	it("should not fail on time elapsed", async () => {
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 4);
		const res = await client.emailOtp.verifyEmail({
			email: testUser.email,
			otp,
		});
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${res.data?.token}`,
				},
			},
		});
		expect(res.data?.status).toBe(true);
		expect(session.data?.user.emailVerified).toBe(true);
	});

	it("should create verification otp on server", async () => {
		otp = await auth.api.createVerificationOTP({
			body: {
				type: "sign-in",
				email: "test@email.com",
			},
		});
		otp = await auth.api.createVerificationOTP({
			body: {
				type: "sign-in",
				email: "test@email.com",
			},
		});
		expect(otp.length).toBe(6);
	});

	it("should get verification otp on server", async () => {
		const res = await auth.api.getVerificationOTP({
			query: {
				email: "test@email.com",
				type: "sign-in",
			},
		});
	});

	it("should work with custom options", async () => {
		const { client, testUser, auth } = await getTestInstance(
			{
				plugins: [
					bearer(),
					emailOTP({
						async sendVerificationOTP({ email, otp: _otp, type }) {
							otp = _otp;
							otpFn(email, _otp, type);
						},
						sendVerificationOnSignUp: true,
						expiresIn: 10,
						otpLength: 8,
					}),
				],
				emailVerification: {
					autoSignInAfterVerification: true,
				},
			},
			{
				clientOptions: {
					plugins: [emailOTPClient()],
				},
			},
		);
		await client.emailOtp.sendVerificationOtp({
			type: "email-verification",
			email: testUser.email,
		});
		expect(otp.length).toBe(8);
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(11 * 1000);
		const verifyRes = await client.emailOtp.verifyEmail({
			email: testUser.email,
			otp,
		});
		expect(verifyRes.error?.code).toBe("OTP_EXPIRED");
	});
});

describe("email-otp-verify", async () => {
	const otpFn = vi.fn();
	const otp = [""];
	const { client, testUser, auth } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP({ email, otp: _otp, type }) {
						otp.push(_otp);
						otpFn(email, _otp, type);
					},
					sendVerificationOnSignUp: true,
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

	it("should not create verification otp when disableSignUp and user not registered", async () => {
		for (let param of [
			{
				email: "test-email@domain.com",
				isNull: true,
			},
			{
				email: testUser.email,
				isNull: false,
			},
		]) {
			await client.emailOtp.sendVerificationOtp({
				email: param.email,
				type: "email-verification",
			});
			const res = await auth.api.getVerificationOTP({
				query: {
					email: param.email,
					type: "email-verification",
				},
			});
			if (param.isNull) {
				expect(res.otp).toBeNull();
			} else {
				expect(res.otp).not.toBeNull();
			}
		}
	});

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
	});

	it("should block after exceeding allowed attempts", async () => {
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});

		for (let i = 0; i < 3; i++) {
			const res = await client.emailOtp.verifyEmail({
				email: testUser.email,
				otp: "wrong-otp",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");
		}

		//Try one more time - should be blocked
		const res = await client.emailOtp.verifyEmail({
			email: testUser.email,
			otp: "000000",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Too many attempts");
	});

	it("should block reset password after exceeding allowed attempts", async () => {
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "forget-password",
		});

		for (let i = 0; i < 3; i++) {
			const res = await client.emailOtp.resetPassword({
				email: testUser.email,
				otp: "wrong-otp",
				password: "new-password",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");
		}

		// Try one more time - should be blocked
		const res = await client.emailOtp.resetPassword({
			email: testUser.email,
			otp: "000000",
			password: "new-password",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Too many attempts");
	});
});

describe("custom rate limiting storage", async () => {
	const { client, testUser } = await getTestInstance({
		rateLimit: {
			enabled: true,
		},
		plugins: [
			emailOTP({
				async sendVerificationOTP(data, request) {},
			}),
		],
	});

	it.each([
		{
			path: "/email-otp/send-verification-otp",
			body: {
				email: "test@email.com",
				type: "sign-in",
			},
		},
		{
			path: "/sign-in/email-otp",
			body: {
				email: "test@email.com",
				otp: "12312",
			},
		},
		{
			path: "/email-otp/verify-email",
			body: {
				email: "test@email.com",
				otp: "12312",
			},
		},
	])("should rate limit send verification endpoint", async ({ path, body }) => {
		for (let i = 0; i < 10; i++) {
			const response = await client.$fetch(path, {
				method: "POST",
				body,
			});
			if (i >= 3) {
				expect(response.error?.status).toBe(429);
			}
		}
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(60 * 1000);
		const response = await client.$fetch(path, {
			method: "POST",
			body,
		});
		expect(response.error?.status).not.toBe(429);
	});
});

describe("custom generate otpFn", async () => {
	const { client, testUser } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP(data, request) {},
					generateOTP(data, request) {
						return "123456";
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [emailOTPClient()],
			},
		},
	);

	it("should generate otp", async () => {
		const res = await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		expect(res.data?.success).toBe(true);
	});

	it("should verify email with otp", async () => {
		const res = await client.emailOtp.verifyEmail({
			email: testUser.email,
			otp: "123456",
		});
		expect(res.data?.status).toBe(true);
	});
});
