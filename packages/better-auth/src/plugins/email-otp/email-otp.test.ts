import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { bearer } from "../bearer";
import { emailOTP } from ".";
import { emailOTPClient } from "./client";
import { splitAtLastColon } from "./utils";

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

	it("should sign-up with uppercase email", async () => {
		const testUser2 = {
			email: "TEST-EMAIL@DOMAIN.COM",
		};
		await client.emailOtp.sendVerificationOtp({
			email: testUser2.email,
			type: "sign-in",
		});

		const verifiedUser = await client.signIn.emailOtp({
			email: testUser2.email,
			otp,
		});
		expect(verifiedUser.data?.token).toBeDefined();
	});

	it("should sign-up with varying case email", async () => {
		const testUser2 = {
			email: "test-email@domain.com",
		};
		await client.emailOtp.sendVerificationOtp({
			email: testUser2.email,
			type: "sign-in",
		});

		const verifiedUser = await client.signIn.emailOtp({
			email: testUser2.email.toUpperCase(),
			otp,
		});
		expect(verifiedUser.data?.token).toBeDefined();
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

	it("should reset password", async () => {
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "forget-password",
		});
		const res = await client.emailOtp.resetPassword({
			email: testUser.email,
			otp,
			password: "changed-password",
		});

		const { data, error } = await client.signIn.email({
			email: testUser.email,
			password: "changed-password",
		});
		expect(data?.user).toBeDefined();
	});

	it("should call onPasswordReset callback when resetting password", async () => {
		const onPasswordResetMock = vi.fn();
		const { client, testUser } = await getTestInstance(
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
				emailAndPassword: {
					enabled: true,
					onPasswordReset: onPasswordResetMock,
				},
			},
			{
				clientOptions: {
					plugins: [emailOTPClient()],
				},
			},
		);

		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "forget-password",
		});

		await client.emailOtp.resetPassword({
			email: testUser.email,
			otp,
			password: "new-password",
		});

		expect(onPasswordResetMock).toHaveBeenCalledWith(
			{ user: expect.objectContaining({ email: testUser.email }) },
			expect.any(Object),
		);
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
		await vi.advanceTimersByTimeAsync(1000 * 60 * 6);
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

	it("should prevent user enumeration when disableSignUp is enabled", async () => {
		// Should return success for non-existent user to prevent enumeration
		const response = await client.emailOtp.sendVerificationOtp({
			email: "non-existent@domain.com",
			type: "email-verification",
		});

		expect(response.data?.success).toBe(true);
		expect(response.error).toBeFalsy();

		// Existing user should also succeed
		const successRes = await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		expect(successRes.data?.success).toBe(true);
		expect(successRes.error).toBeFalsy();
	});

	it("should not send OTP email for non-existent users when disableSignUp is enabled", async () => {
		const sendOtpSpy = vi.fn();
		const { client: testClient, testUser: existingUser } =
			await getTestInstance(
				{
					plugins: [
						emailOTP({
							async sendVerificationOTP({ email, otp: _otp, type }) {
								sendOtpSpy(email, _otp, type);
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

		sendOtpSpy.mockClear();

		// Try to send OTP to non-existent user
		const nonExistentResponse = await testClient.emailOtp.sendVerificationOtp({
			email: "non-existent-user@example.com",
			type: "sign-in",
		});

		// Should return success but not actually call sendVerificationOTP
		expect(nonExistentResponse.data?.success).toBe(true);
		expect(sendOtpSpy).not.toHaveBeenCalled();

		// Now try with an existing user - should actually send OTP
		const existingResponse = await testClient.emailOtp.sendVerificationOtp({
			email: existingUser.email,
			type: "sign-in",
		});

		// Should return success AND call sendVerificationOTP
		expect(existingResponse.data?.success).toBe(true);
		expect(sendOtpSpy).toHaveBeenCalledTimes(1);
		expect(sendOtpSpy).toHaveBeenCalledWith(
			existingUser.email,
			expect.any(String),
			"sign-in",
		);
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

describe("custom storeOTP", async () => {
	// Testing hashed OTPs.
	describe("hashed", async () => {
		let sendVerificationOtpFn = async (data: {
			email: string;
			otp: string;
			type: "sign-in" | "email-verification" | "forget-password";
		}) => {};

		function getTheSentOTP() {
			let gotOtp: string | null = null;
			let sub = (otp: string) => {};
			sendVerificationOtpFn = async (data) => {
				gotOtp = data.otp;
				sub(data.otp);
			};
			return {
				get: () =>
					new Promise<string>((resolve) => {
						if (gotOtp) {
							resolve(gotOtp);
						} else {
							sub = (otp) => {
								gotOtp = otp;
								resolve(otp);
							};
						}
					}),
			};
		}

		const { client, testUser, auth } = await getTestInstance(
			{
				plugins: [
					emailOTP({
						sendVerificationOTP: async (d) => {
							await sendVerificationOtpFn(d);
						},
						storeOTP: "hashed",
					}),
				],
			},
			{
				clientOptions: {
					plugins: [emailOTPClient()],
				},
			},
		);
		const authCtx = await auth.$context;
		const userEmail1 = `${crypto.randomUUID()}@email.com`;

		let validOTP = "";

		it("should create a hashed otp", async () => {
			const { get } = getTheSentOTP();
			await client.emailOtp.sendVerificationOtp({
				email: userEmail1,
				type: "sign-in",
			});
			const verificationValue =
				await authCtx.internalAdapter.findVerificationValue(
					`sign-in-otp-${userEmail1}`,
				);

			const storedOtp = verificationValue?.value || "";
			const otp = await get();
			validOTP = otp;
			expect(storedOtp.length !== 0).toBe(true);
			expect(splitAtLastColon(storedOtp)[0]).not.toBe(otp);
			expect(storedOtp.endsWith(":0")).toBe(true);
		});

		it("should not be allowed to get otp if storeOTP is hashed", async () => {
			try {
				await auth.api.getVerificationOTP({
					query: {
						email: userEmail1,
						type: "sign-in",
					},
				});
			} catch (error: any) {
				expect(error.statusCode).toBe(400);
				expect(error.status).toBe("BAD_REQUEST");
				expect(error.body.code).toBe(
					"OTP_IS_HASHED_CANNOT_RETURN_THE_PLAIN_TEXT_OTP",
				);
				return;
			}
			// Should not reach here given the above should throw and thus return.
			expect(true).toBe(false);
		});

		it("should be able to sign in with normal otp", async () => {
			const res = await client.signIn.emailOtp({
				email: userEmail1,
				otp: validOTP,
			});
			expect(res.data?.user.email).toBe(userEmail1);
			expect(res.data?.token).toBeDefined();
		});
	});

	// Testing encrypted OTPs.
	describe("encrypted", async () => {
		let sendVerificationOtpFn = async (data: {
			email: string;
			otp: string;
			type: "sign-in" | "email-verification" | "forget-password";
		}) => {};

		function getTheSentOTP() {
			let gotOtp: string | null = null;
			let sub = (otp: string) => {};
			sendVerificationOtpFn = async (data) => {
				gotOtp = data.otp;
				sub(data.otp);
			};
			return {
				get: () =>
					new Promise<string>((resolve) => {
						if (gotOtp) {
							resolve(gotOtp);
						} else {
							sub = (otp) => {
								gotOtp = otp;
								resolve(otp);
							};
						}
					}),
			};
		}

		const { client, testUser, auth } = await getTestInstance(
			{
				plugins: [
					emailOTP({
						sendVerificationOTP: async (d) => {
							await sendVerificationOtpFn(d);
						},
						storeOTP: "encrypted",
					}),
				],
			},
			{
				clientOptions: {
					plugins: [emailOTPClient()],
				},
			},
		);
		const authCtx = await auth.$context;
		const userEmail1 = `${crypto.randomUUID()}@email.com`;

		let encryptedOtp = "";
		let validOTP = "";

		it("should create an encrypted otp", async () => {
			const { get } = getTheSentOTP();
			await client.emailOtp.sendVerificationOtp({
				email: userEmail1,
				type: "sign-in",
			});
			const verificationValue =
				await authCtx.internalAdapter.findVerificationValue(
					`sign-in-otp-${userEmail1}`,
				);

			const storedOtp = verificationValue?.value || "";
			const otp = await get();
			expect(storedOtp.length !== 0).toBe(true);
			expect(splitAtLastColon(storedOtp)[0]).not.toBe(otp);
			expect(storedOtp.endsWith(":0")).toBe(true);
			encryptedOtp = storedOtp;
			validOTP = otp;
		});

		it("should be allowed to get otp if storeOTP is encrypted", async () => {
			try {
				const res = await auth.api.getVerificationOTP({
					query: {
						email: userEmail1,
						type: "sign-in",
					},
				});
				if (!res.otp) {
					expect(true).toBe(false);
					return;
				}
				expect(res.otp).toEqual(validOTP);
				expect(res.otp.length).toBe(6);
			} catch (error: any) {
				expect(error).not.toBeDefined();
			}
		});

		it("should be able to sign in with encrypted otp", async () => {
			const res = await client.signIn.emailOtp({
				email: userEmail1,
				otp: validOTP,
			});
			expect(res.data?.user.email).toBe(userEmail1);
			expect(res.data?.token).toBeDefined();
		});
	});

	describe("custom encryptor", async () => {
		let sendVerificationOtpFn = async (data: {
			email: string;
			otp: string;
			type: "sign-in" | "email-verification" | "forget-password";
		}) => {};

		function getTheSentOTP() {
			let gotOtp: string | null = null;
			let sub = (otp: string) => {};
			sendVerificationOtpFn = async (data) => {
				gotOtp = data.otp;
				sub(data.otp);
			};
			return {
				get: () =>
					new Promise<string>((resolve) => {
						if (gotOtp) {
							resolve(gotOtp);
						} else {
							sub = (otp) => {
								gotOtp = otp;
								resolve(otp);
							};
						}
					}),
			};
		}

		const { client, testUser, auth } = await getTestInstance(
			{
				plugins: [
					emailOTP({
						sendVerificationOTP: async (d) => {
							await sendVerificationOtpFn(d);
						},
						storeOTP: {
							encrypt: async (otp) => {
								return otp + "encrypted";
							},
							decrypt: async (otp) => {
								return otp.replace("encrypted", "");
							},
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
		const authCtx = await auth.$context;

		let validOTP = "";
		let userEmail1 = `${crypto.randomUUID()}@email.com`;

		it("should create a custom encryptor otp", async () => {
			const { get } = getTheSentOTP();
			await client.emailOtp.sendVerificationOtp({
				email: userEmail1,
				type: "sign-in",
			});
			const verificationValue =
				await authCtx.internalAdapter.findVerificationValue(
					`sign-in-otp-${userEmail1}`,
				);
			const storedOtp = verificationValue?.value || "";
			const otp = await get();
			expect(storedOtp.length !== 0).toBe(true);
			expect(splitAtLastColon(storedOtp)[0]).not.toBe(otp);
			expect(storedOtp.endsWith(":0")).toBe(true);
			validOTP = otp;
		});

		it("should be allowed to get otp if storeOTP is custom encryptor", async () => {
			try {
				const res = await auth.api.getVerificationOTP({
					query: {
						email: userEmail1,
						type: "sign-in",
					},
				});
				if (!res.otp) {
					expect(true).toBe(false);
					return;
				}
				expect(res.otp).toEqual(validOTP);
				expect(res.otp.length).toBe(6);
			} catch (error: any) {
				console.error(error);
				expect(error).not.toBeDefined();
			}
		});

		it("should be able to sign in with custom encryptor otp", async () => {
			const res = await client.signIn.emailOtp({
				email: userEmail1,
				otp: validOTP,
			});
			expect(res.data?.user.email).toBe(userEmail1);
			expect(res.data?.token).toBeDefined();
		});
	});

	describe("custom hasher", async () => {
		let sendVerificationOtpFn = async (data: {
			email: string;
			otp: string;
			type: "sign-in" | "email-verification" | "forget-password";
		}) => {};

		function getTheSentOTP() {
			let gotOtp: string | null = null;
			let sub = (otp: string) => {};
			sendVerificationOtpFn = async (data) => {
				gotOtp = data.otp;
				sub(data.otp);
			};
			return {
				get: () =>
					new Promise<string>((resolve) => {
						if (gotOtp) {
							resolve(gotOtp);
						} else {
							sub = (otp) => {
								gotOtp = otp;
								resolve(otp);
							};
						}
					}),
			};
		}

		const { client, testUser, auth } = await getTestInstance(
			{
				plugins: [
					emailOTP({
						sendVerificationOTP: async (d) => {
							await sendVerificationOtpFn(d);
						},
						storeOTP: {
							hash: async (otp) => {
								return otp + "hashed";
							},
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
		const authCtx = await auth.$context;

		let validOTP = "";
		let userEmail1 = `${crypto.randomUUID()}@email.com`;

		it("should create a custom hasher otp", async () => {
			const { get } = getTheSentOTP();
			await client.emailOtp.sendVerificationOtp({
				email: userEmail1,
				type: "sign-in",
			});
			const verificationValue =
				await authCtx.internalAdapter.findVerificationValue(
					`sign-in-otp-${userEmail1}`,
				);
			const storedOtp = verificationValue?.value || "";
			const otp = await get();
			expect(storedOtp.length !== 0).toBe(true);
			expect(splitAtLastColon(storedOtp)[0]).not.toBe(otp);
			expect(storedOtp.endsWith(":0")).toBe(true);
			validOTP = otp;
		});

		it("should be allowed to get otp if storeOTP is custom hasher", async () => {
			try {
				const result = await auth.api.getVerificationOTP({
					query: {
						email: userEmail1,
						type: "sign-in",
					},
				});
			} catch (error: any) {
				expect(error.statusCode).toBe(400);
				expect(error.status).toBe("BAD_REQUEST");
				expect(error.body.code).toBe(
					"OTP_IS_HASHED_CANNOT_RETURN_THE_PLAIN_TEXT_OTP",
				);
				return;
			}
			// Should not reach here given the above should throw and thus return.
			expect(true).toBe(false);
		});

		it("should be able to sign in with custom hasher otp", async () => {
			const res = await client.signIn.emailOtp({
				email: userEmail1,
				otp: validOTP,
			});
			expect(res.data?.user.email).toBe(userEmail1);
			expect(res.data?.token).toBeDefined();
		});
	});
});

describe("override default email verification", async () => {
	let otp = "";
	const { cookieSetter, customFetchImpl } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
		},
		emailVerification: {
			sendOnSignUp: true,
		},
		plugins: [
			emailOTP({
				async sendVerificationOTP(data, request) {
					otp = data.otp;
				},
				overrideDefaultEmailVerification: true,
			}),
		],
	});

	const client = createAuthClient({
		plugins: [emailOTPClient()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl,
		},
	});

	const headers = new Headers();
	it("should send verification email on sign up", async () => {
		await client.signUp.email(
			{
				email: "test-otp-override@email.com",
				password: "password",
				name: "Test User",
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		expect(otp.length).toBe(6);
	});

	it("should verify email with otp", async () => {
		const res = await client.emailOtp.verifyEmail({
			email: "test-otp-override@email.com",
			otp,
		});
		expect(res.data?.status).toBe(true);
		expect(res.data?.user.emailVerified).toBe(true);
	});

	it("should by default not override default email verification", async () => {
		const sendVerificationOTP = vi.fn();
		const { client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			emailVerification: {
				sendOnSignUp: true,
				async sendVerificationEmail(data, request) {
					sendVerificationOTP(data, request);
				},
			},
			plugins: [
				emailOTP({
					async sendVerificationOTP(data, request) {
						//
					},
				}),
			],
		});
		await client.signUp.email(
			{
				email: "test-otp-override@email.com",
				password: "password",
				name: "Test User",
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		expect(sendVerificationOTP).toHaveBeenCalled();
	});

	it("should send email only once when override is enabled", async () => {
		let callCountForTestEmail = 0;
		const sendVerificationOTPFn = vi.fn(async (data, request) => {
			if (data.email === "test-no-duplicate@email.com") {
				callCountForTestEmail++;
			}
		});

		const { client } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
			},
			emailVerification: {
				sendOnSignUp: true,
			},
			plugins: [
				emailOTP({
					sendVerificationOTP: sendVerificationOTPFn,
					overrideDefaultEmailVerification: true,
					sendVerificationOnSignUp: true, // This should be ignored when override is true
				}),
			],
		});

		sendVerificationOTPFn.mockClear();

		await client.signUp.email({
			email: "test-no-duplicate@email.com",
			password: "password",
			name: "Test User",
		});

		expect(sendVerificationOTPFn).toHaveBeenCalledTimes(1);
		expect(sendVerificationOTPFn).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "test-no-duplicate@email.com",
				type: "email-verification",
			}),
			expect.any(Object),
		);
	});
});
