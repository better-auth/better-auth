import { afterEach, describe, expect, it, vi } from "vitest";
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

	afterEach(() => {
		vi.useRealTimers();
	});

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

	it("should sign-up with otp and set name and image", async () => {
		const testUser3 = {
			email: "test-email-with-name@domain.com",
		};
		await client.emailOtp.sendVerificationOtp({
			email: testUser3.email,
			type: "sign-in",
		});
		const newUser = await client.signIn.emailOtp({
			email: testUser3.email,
			otp,
			name: "Test User",
			image: "https://example.com/avatar.png",
		});
		expect(newUser.data?.token).toBeDefined();
		expect(newUser.data?.user.name).toBe("Test User");
		expect(newUser.data?.user.image).toBe("https://example.com/avatar.png");
	});

	it("should check verification otp for non-existent user (signup flow)", async () => {
		const newEmail = "check-otp-no-user@domain.com";
		await client.emailOtp.sendVerificationOtp({
			email: newEmail,
			type: "sign-in",
		});
		const res = await client.emailOtp.checkVerificationOtp({
			email: newEmail,
			type: "sign-in",
			otp,
		});
		expect(res.data?.success).toBe(true);
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

	it("should reset password using new emailOtp.requestPasswordReset endpoint", async () => {
		await client.emailOtp.requestPasswordReset({
			email: testUser.email,
		});
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

	it("should reset password using deprecated forgetPassword endpoint (backward compatibility)", async () => {
		await client.forgetPassword.emailOtp({
			email: testUser.email,
		});
		await client.emailOtp.resetPassword({
			email: testUser.email,
			otp,
			password: "changed-password-2",
		});

		const { data } = await client.signIn.email({
			email: testUser.email,
			password: "changed-password-2",
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

	it("should reject change-email type", async () => {
		const res = await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "change-email",
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toBe("Invalid OTP type");
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
		await auth.api.getVerificationOTP({
			query: {
				email: "test@email.com",
				type: "sign-in",
			},
		});
	});

	it("should work with custom options", async () => {
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

describe("change email", async () => {
	const otpFn = vi.fn();
	let otp = "";
	const { client, testUser, runWithUser } = await getTestInstance(
		{
			plugins: [
				bearer(),
				emailOTP({
					async sendVerificationOTP({ email, otp: _otp, type }) {
						otp = _otp;
						otpFn(email, _otp, type);
					},
					sendVerificationOnSignUp: true,
					changeEmail: { enabled: true },
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

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("request", () => {
		it("should send otp for change email request", async () => {
			const newEmail = "new-email@test.com";
			otpFn.mockClear();
			await runWithUser(testUser.email, testUser.password, async () => {
				const res = await client.emailOtp.requestEmailChange({
					newEmail,
				});
				expect(res.data?.success).toBe(true);
				expect(res.error).toBeFalsy();
			});
			expect(otpFn).toHaveBeenCalledWith(
				newEmail,
				expect.any(String),
				"change-email",
			);
		});

		it("should not send otp for change email request if session does not exist", async () => {
			const res = await client.emailOtp.requestEmailChange({
				newEmail: "new-email@test.com",
			});
			expect(res.error?.status).toBe(401);
			expect(res.error?.code).toBe("UNAUTHORIZED");
		});

		it("should not send otp for change email request if session is invalid", async () => {
			const res = await client.emailOtp.requestEmailChange({
				newEmail: "new-email@test.com",
				fetchOptions: {
					headers: new Headers({
						Authorization: "Bearer invalid-session-token",
					}),
				},
			});
			expect(res.error?.status).toBe(401);
			expect(res.error?.code).toBe("UNAUTHORIZED");
		});

		it("should not send otp for change email request when change email with OTP is disabled", async () => {
			const {
				client: disabledClient,
				testUser: disabledTestUser,
				runWithUser: disabledRunWithUser,
			} = await getTestInstance(
				{
					plugins: [
						bearer(),
						emailOTP({
							async sendVerificationOTP() {},
							sendVerificationOnSignUp: true,
							changeEmail: { enabled: false },
						}),
					],
				},
				{
					clientOptions: {
						plugins: [emailOTPClient()],
					},
				},
			);

			let res: Awaited<
				ReturnType<typeof disabledClient.emailOtp.requestEmailChange>
			>;
			await disabledRunWithUser(
				disabledTestUser.email,
				disabledTestUser.password,
				async () => {
					res = await disabledClient.emailOtp.requestEmailChange({
						newEmail: "new@test.com",
					});
				},
			);
			expect(res!.error?.status).toBe(400);
			expect(res!.error?.message).toBe("Change email with OTP is disabled");
		});

		it("should not send otp for change email request if email is same as old email", async () => {
			let res: Awaited<ReturnType<typeof client.emailOtp.requestEmailChange>>;
			await runWithUser(testUser.email, testUser.password, async () => {
				res = await client.emailOtp.requestEmailChange({
					newEmail: testUser.email,
				});
			});
			expect(res!.error?.status).toBe(400);
			expect(res!.error?.message).toContain("Email is the same");
		});

		it("should not send otp for change email request if email is already used by another account", async () => {
			const otherUser = {
				email: "other-user@test.com",
				password: "password123",
				name: "Other User",
			};
			await client.signUp.email(otherUser);

			otpFn.mockClear();
			await runWithUser(testUser.email, testUser.password, async () => {
				const res = await client.emailOtp.requestEmailChange({
					newEmail: otherUser.email,
				});
				expect(res.data?.success).toBe(true);
			});
			expect(otpFn).not.toHaveBeenCalledWith(
				otherUser.email,
				expect.any(String),
				"change-email",
			);
		});

		describe("when verifyCurrentEmail is enabled", async () => {
			const verifyCurrentOtpFn = vi.fn();
			let currentEmailOtp = "";
			const {
				client: vcClient,
				testUser: vcTestUser,
				runWithUser: vcRunWithUser,
			} = await getTestInstance(
				{
					plugins: [
						bearer(),
						emailOTP({
							async sendVerificationOTP({ email, otp: _otp, type }) {
								currentEmailOtp = _otp;
								verifyCurrentOtpFn(email, _otp, type);
							},
							sendVerificationOnSignUp: true,
							changeEmail: { enabled: true, verifyCurrentEmail: true },
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

			it("should require otp when requesting email change", async () => {
				let res: Awaited<
					ReturnType<typeof vcClient.emailOtp.requestEmailChange>
				>;
				await vcRunWithUser(vcTestUser.email, vcTestUser.password, async () => {
					res = await vcClient.emailOtp.requestEmailChange({
						newEmail: "new@test.com",
					});
				});
				expect(res!.error?.status).toBe(400);
				expect(res!.error?.message).toBe(
					"OTP is required to verify current email",
				);
			});

			it("should reject invalid current email otp when requesting email change", async () => {
				let res: Awaited<
					ReturnType<typeof vcClient.emailOtp.requestEmailChange>
				>;
				await vcRunWithUser(vcTestUser.email, vcTestUser.password, async () => {
					res = await vcClient.emailOtp.requestEmailChange({
						newEmail: "new@test.com",
						otp: "000000",
					});
				});
				expect(res!.error?.status).toBe(400);
				expect(res!.error?.code).toBe("INVALID_OTP");
			});

			it("should reject when no email-verification OTP was requested for current email", async () => {
				let res: Awaited<
					ReturnType<typeof vcClient.emailOtp.requestEmailChange>
				>;
				await vcRunWithUser(vcTestUser.email, vcTestUser.password, async () => {
					res = await vcClient.emailOtp.requestEmailChange({
						newEmail: "new@test.com",
						otp: "123456",
					});
				});
				expect(res!.error?.status).toBe(400);
				expect(res!.error?.code).toBe("INVALID_OTP");
			});

			it("should reject expired current email OTP when requesting email change", async () => {
				const {
					client: expClient,
					testUser: expTestUser,
					runWithUser: expRunWithUser,
				} = await getTestInstance(
					{
						plugins: [
							bearer(),
							emailOTP({
								async sendVerificationOTP({ otp: _otp, type }) {
									if (type === "email-verification") {
										currentEmailOtp = _otp;
									}
								},
								sendVerificationOnSignUp: true,
								changeEmail: { enabled: true, verifyCurrentEmail: true },
								expiresIn: 60,
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

				await expRunWithUser(
					expTestUser.email,
					expTestUser.password,
					async () => {
						await expClient.emailOtp.sendVerificationOtp({
							email: expTestUser.email,
							type: "email-verification",
						});
					},
				);
				vi.useFakeTimers();
				await vi.advanceTimersByTimeAsync(61 * 1000);

				let res: Awaited<
					ReturnType<typeof expClient.emailOtp.requestEmailChange>
				>;
				await expRunWithUser(
					expTestUser.email,
					expTestUser.password,
					async () => {
						res = await expClient.emailOtp.requestEmailChange({
							newEmail: "new@test.com",
							otp: currentEmailOtp,
						});
					},
				);
				expect(res!.error?.status).toBe(400);
				expect(res!.error?.code).toBe("OTP_EXPIRED");
			});

			it("should send change-email OTP when valid current email OTP is provided", async () => {
				const newEmail = "verified-change@test.com";
				verifyCurrentOtpFn.mockClear();
				await vcRunWithUser(vcTestUser.email, vcTestUser.password, async () => {
					await vcClient.emailOtp.sendVerificationOtp({
						email: vcTestUser.email,
						type: "email-verification",
					});
				});

				expect(currentEmailOtp).toBeTruthy();
				await vcRunWithUser(vcTestUser.email, vcTestUser.password, async () => {
					const res = await vcClient.emailOtp.requestEmailChange({
						newEmail,
						otp: currentEmailOtp,
					});
					expect(res.data?.success).toBe(true);
					expect(res.error).toBeFalsy();
				});
				expect(verifyCurrentOtpFn).toHaveBeenCalledWith(
					newEmail,
					expect.any(String),
					"change-email",
				);
			});
		});
	});

	describe("change", () => {
		it("should change email with otp", async () => {
			const userToChange = {
				email: "user-to-change@test.com",
				password: "password123",
				name: "User To Change",
			};
			await client.signUp.email(userToChange);

			const newEmail = "changed-email@test.com";
			await runWithUser(userToChange.email, userToChange.password, async () => {
				const requestRes = await client.emailOtp.requestEmailChange({
					newEmail,
				});
				expect(requestRes.data?.success).toBe(true);
			});
			expect(otpFn).toHaveBeenCalledWith(
				newEmail,
				expect.any(String),
				"change-email",
			);

			let sessionEmail: string | undefined;
			await runWithUser(userToChange.email, userToChange.password, async () => {
				const changeRes = await client.emailOtp.changeEmail({
					newEmail,
					otp,
				});
				expect(changeRes.data?.success).toBe(true);
				expect(changeRes.error).toBeFalsy();
				const session = await client.getSession();
				sessionEmail = session.data?.user.email;
			});
			expect(sessionEmail).toBe(newEmail);
		});

		it("should not change email if session does not exist", async () => {
			const res = await client.emailOtp.changeEmail({
				newEmail: "other@test.com",
				otp: "123456",
			});
			expect(res.error?.status).toBe(401);
			expect(res.error?.code).toBe("UNAUTHORIZED");
		});

		it("should not change email if session is invalid", async () => {
			const res = await client.emailOtp.changeEmail({
				newEmail: "other@test.com",
				otp: "123456",
				fetchOptions: {
					headers: new Headers({
						Authorization: "Bearer invalid-session-token",
					}),
				},
			});
			expect(res.error?.status).toBe(401);
			expect(res.error?.code).toBe("UNAUTHORIZED");
		});

		it("should not change email if session contains different email from otp request email", async () => {
			const newEmail = "target-email@test.com";
			await runWithUser(testUser.email, testUser.password, async () => {
				const requestRes = await client.emailOtp.requestEmailChange({
					newEmail,
				});
				expect(requestRes.data?.success).toBe(true);
			});

			const otherUser = {
				email: "other-account@test.com",
				password: "password123",
				name: "Other Account",
			};
			await client.signUp.email(otherUser);

			let changeRes: Awaited<ReturnType<typeof client.emailOtp.changeEmail>>;
			await runWithUser(otherUser.email, otherUser.password, async () => {
				changeRes = await client.emailOtp.changeEmail({
					newEmail,
					otp,
				});
			});
			expect(changeRes!.error?.status).toBe(400);
			expect(changeRes!.error?.code).toBe("INVALID_OTP");
		});

		it("should not change email if new email is different from otp request email", async () => {
			const requestedNewEmail = "requested@test.com";
			const wrongNewEmail = "wrong@test.com";
			await runWithUser(testUser.email, testUser.password, async () => {
				const requestRes = await client.emailOtp.requestEmailChange({
					newEmail: requestedNewEmail,
				});
				expect(requestRes.data?.success).toBe(true);
			});

			let changeRes: Awaited<ReturnType<typeof client.emailOtp.changeEmail>>;
			await runWithUser(testUser.email, testUser.password, async () => {
				changeRes = await client.emailOtp.changeEmail({
					newEmail: wrongNewEmail,
					otp,
				});
			});
			expect(changeRes!.error?.status).toBe(400);
			expect(changeRes!.error?.code).toBe("INVALID_OTP");
		});

		it("should not change email if otp is invalid", async () => {
			const newEmail = "another-new@test.com";
			await runWithUser(testUser.email, testUser.password, async () => {
				const requestRes = await client.emailOtp.requestEmailChange({
					newEmail,
				});
				expect(requestRes.data?.success).toBe(true);
			});

			let changeRes: Awaited<ReturnType<typeof client.emailOtp.changeEmail>>;
			await runWithUser(testUser.email, testUser.password, async () => {
				changeRes = await client.emailOtp.changeEmail({
					newEmail,
					otp: "000000",
				});
			});
			expect(changeRes!.error?.status).toBe(400);
			expect(changeRes!.error?.code).toBe("INVALID_OTP");
		});

		it("should not change email if otp is expired", async () => {
			const newEmail = "expired-otp@test.com";
			const {
				client: expClient,
				testUser: expTestUser,
				runWithUser: expRunWithUser,
			} = await getTestInstance(
				{
					plugins: [
						bearer(),
						emailOTP({
							async sendVerificationOTP({ otp: _otp }) {
								otp = _otp;
							},
							sendVerificationOnSignUp: true,
							expiresIn: 60,
							changeEmail: { enabled: true },
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

			await expRunWithUser(
				expTestUser.email,
				expTestUser.password,
				async () => {
					const requestRes = await expClient.emailOtp.requestEmailChange({
						newEmail,
					});
					expect(requestRes.data?.success).toBe(true);
				},
			);
			vi.useFakeTimers();
			await vi.advanceTimersByTimeAsync(61 * 1000);

			let changeRes: Awaited<ReturnType<typeof expClient.emailOtp.changeEmail>>;
			await expRunWithUser(
				expTestUser.email,
				expTestUser.password,
				async () => {
					changeRes = await expClient.emailOtp.changeEmail({
						newEmail,
						otp,
					});
				},
			);
			expect(changeRes!.error?.status).toBe(400);
			expect(changeRes!.error?.code).toBe("OTP_EXPIRED");
		});

		it("should call beforeEmailVerification callback when email is updated", async () => {
			const beforeEmailVerification = vi.fn();
			let callbackOtp = "";
			const {
				client: cbClient,
				testUser: cbTestUser,
				runWithUser: cbRunWithUser,
			} = await getTestInstance(
				{
					plugins: [
						bearer(),
						emailOTP({
							async sendVerificationOTP({ otp: _otp }) {
								callbackOtp = _otp;
							},
							sendVerificationOnSignUp: true,
							changeEmail: { enabled: true },
						}),
					],
					emailVerification: {
						autoSignInAfterVerification: true,
						beforeEmailVerification,
					},
				},
				{
					clientOptions: {
						plugins: [emailOTPClient()],
					},
				},
			);

			const newEmail = "before-cb@test.com";
			await cbRunWithUser(cbTestUser.email, cbTestUser.password, async () => {
				await cbClient.emailOtp.requestEmailChange({ newEmail });
			});
			await cbRunWithUser(cbTestUser.email, cbTestUser.password, async () => {
				await cbClient.emailOtp.changeEmail({
					newEmail,
					otp: callbackOtp,
				});
			});
			expect(beforeEmailVerification).toHaveBeenCalledTimes(1);
			expect(beforeEmailVerification).toHaveBeenCalledWith(
				expect.objectContaining({
					email: cbTestUser.email,
				}),
				expect.any(Object),
			);
		});

		it("should call afterEmailVerification callback when email is updated", async () => {
			const afterEmailVerification = vi.fn();
			let callbackOtp = "";
			const {
				client: cbClient,
				testUser: cbTestUser,
				runWithUser: cbRunWithUser,
			} = await getTestInstance(
				{
					plugins: [
						bearer(),
						emailOTP({
							async sendVerificationOTP({ otp: _otp }) {
								callbackOtp = _otp;
							},
							sendVerificationOnSignUp: true,
							changeEmail: { enabled: true },
						}),
					],
					emailVerification: {
						autoSignInAfterVerification: true,
						afterEmailVerification,
					},
				},
				{
					clientOptions: {
						plugins: [emailOTPClient()],
					},
				},
			);

			const newEmail = "after-cb@test.com";
			await cbRunWithUser(cbTestUser.email, cbTestUser.password, async () => {
				await cbClient.emailOtp.requestEmailChange({ newEmail });
			});
			await cbRunWithUser(cbTestUser.email, cbTestUser.password, async () => {
				await cbClient.emailOtp.changeEmail({
					newEmail,
					otp: callbackOtp,
				});
			});
			expect(afterEmailVerification).toHaveBeenCalledTimes(1);
			expect(afterEmailVerification).toHaveBeenCalledWith(
				expect.objectContaining({
					email: newEmail,
					emailVerified: true,
				}),
				expect.any(Object),
			);
		});
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
	const { client } = await getTestInstance({
		rateLimit: {
			enabled: true,
		},
		plugins: [
			emailOTP({
				async sendVerificationOTP(data, request) {},
			}),
		],
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.for([
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
	type SendVerificationOtpData = {
		email: string;
		otp: string;
		type: "sign-in" | "email-verification" | "forget-password" | "change-email";
	};

	// Testing hashed OTPs.
	describe("hashed", async () => {
		let sendVerificationOtpFn = async (data: SendVerificationOtpData) => {};

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

		const { client, auth } = await getTestInstance(
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
			await expect(
				auth.api.getVerificationOTP({
					query: {
						email: userEmail1,
						type: "sign-in",
					},
				}),
			).rejects.toMatchObject({
				statusCode: 400,
				status: "BAD_REQUEST",
				body: {
					message: "OTP is hashed, cannot return the plain text OTP",
				},
			});
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
		let sendVerificationOtpFn = async (data: SendVerificationOtpData) => {};

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

		const { client, auth } = await getTestInstance(
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
			validOTP = otp;
		});

		it("should be allowed to get otp if storeOTP is encrypted", async () => {
			const res = await auth.api.getVerificationOTP({
				query: {
					email: userEmail1,
					type: "sign-in",
				},
			});
			expect(res.otp).toEqual(validOTP);
			expect(res.otp?.length).toBe(6);
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
		let sendVerificationOtpFn = async (data: SendVerificationOtpData) => {};

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

		const { client, auth } = await getTestInstance(
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
		const userEmail1 = `${crypto.randomUUID()}@email.com`;

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
			const res = await auth.api.getVerificationOTP({
				query: {
					email: userEmail1,
					type: "sign-in",
				},
			});
			expect(res.otp).toEqual(validOTP);
			expect(res.otp?.length).toBe(6);
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
		let sendVerificationOtpFn = async (data: SendVerificationOtpData) => {};

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

		const { client, auth } = await getTestInstance(
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
		const userEmail1 = `${crypto.randomUUID()}@email.com`;

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
			await expect(
				auth.api.getVerificationOTP({
					query: {
						email: userEmail1,
						type: "sign-in",
					},
				}),
			).rejects.toMatchObject({
				statusCode: 400,
				status: "BAD_REQUEST",
				body: {
					message: "OTP is hashed, cannot return the plain text OTP",
				},
			});
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

		expect(callCountForTestEmail).toBe(1);
		expect(sendVerificationOTPFn).toHaveBeenCalledTimes(1);
		expect(sendVerificationOTPFn).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "test-no-duplicate@email.com",
				type: "email-verification",
			}),
			expect.any(Object),
		);
	});

	it("should call afterEmailVerification hook when override is enabled", async () => {
		const afterEmailVerification = vi.fn();
		let otp = "";

		const { client } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
				},
				emailVerification: {
					sendOnSignUp: true,
					afterEmailVerification,
				},
				plugins: [
					emailOTP({
						async sendVerificationOTP(data, request) {
							otp = data.otp;
						},
						overrideDefaultEmailVerification: true,
					}),
				],
			},
			{
				clientOptions: {
					plugins: [emailOTPClient()],
				},
			},
		);

		await client.signUp.email({
			email: "test-hook@email.com",
			password: "password",
			name: "Test User",
		});

		const res = await client.emailOtp.verifyEmail({
			email: "test-hook@email.com",
			otp,
		});

		expect(res.data?.status).toBe(true);
		expect(afterEmailVerification).toHaveBeenCalledTimes(1);
		expect(afterEmailVerification).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "test-hook@email.com",
				emailVerified: true,
			}),
			expect.any(Object),
		);
	});
});

describe("sign-up with additional fields via email-otp", async () => {
	let otp = "";
	const { client, auth, sessionSetter } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP({ otp: _otp }) {
						otp = _otp;
					},
				}),
			],
			user: {
				additionalFields: {
					lang: {
						type: "string",
						required: false,
						input: true,
					},
					isAdmin: {
						type: "boolean",
						defaultValue: false,
						input: false,
					},
				},
			},
		},
		{
			clientOptions: {
				plugins: [emailOTPClient()],
			},
		},
	);

	it("should sign-up with additional fields", async () => {
		const email = "additional-fields@domain.com";
		const headers = new Headers();
		await client.emailOtp.sendVerificationOtp({
			email,
			type: "sign-in",
		});
		const res = await client.signIn.emailOtp(
			{
				email,
				otp,
				name: "AF User",
				lang: "ko",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.data?.token).toBeDefined();
		expect(res.data?.user.name).toBe("AF User");
		const session = await auth.api.getSession({ headers });
		if (!session) {
			throw new Error("session not found");
		}
		expect(session.user.name).toBe("AF User");
		expect(session.user.lang).toBe("ko");
		expect(session.user.isAdmin).toBe(false);
	});

	it("should ignore input: false fields and use default value", async () => {
		const email = "ignore-input-false@domain.com";
		const headers = new Headers();
		await client.emailOtp.sendVerificationOtp({
			email,
			type: "sign-in",
		});
		const res = await client.signIn.emailOtp(
			{
				email,
				otp,
				isAdmin: true,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.data?.token).toBeDefined();
		const session = await auth.api.getSession({ headers });
		if (!session) {
			throw new Error("session not found");
		}
		expect(session.user.isAdmin).toBe(false);
	});
});

describe("race condition protection", async () => {
	let otp = "";
	const { client, auth } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP({ otp: _otp }) {
						otp = _otp;
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

	it("should delete OTP after successful sign-in", async () => {
		const email = "race-test@domain.com";
		await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });

		const res1 = await client.signIn.emailOtp({ email, otp });
		expect(res1.data?.token).toBeDefined();

		const verificationValue =
			await authCtx.internalAdapter.findVerificationValue(
				`sign-in-otp-${email}`,
			);
		expect(verificationValue).toBeNull();

		const res2 = await client.signIn.emailOtp({ email, otp });
		expect(res2.error?.code).toBe("INVALID_OTP");
	});

	it("should delete OTP after successful email verification", async () => {
		const email = "race-verify@domain.com";
		await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
		await client.signIn.emailOtp({ email, otp });

		await client.emailOtp.sendVerificationOtp({
			email,
			type: "email-verification",
		});

		const res1 = await client.emailOtp.verifyEmail({ email, otp });
		expect(res1.data?.status).toBe(true);

		const verificationValue =
			await authCtx.internalAdapter.findVerificationValue(
				`email-verification-otp-${email}`,
			);
		expect(verificationValue).toBeNull();

		const res2 = await client.emailOtp.verifyEmail({ email, otp });
		expect(res2.error?.code).toBe("INVALID_OTP");
	});

	it("should delete OTP after successful password reset", async () => {
		const email = "race-reset@domain.com";
		await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
		const signInOtp = otp;
		await client.signIn.emailOtp({ email, otp: signInOtp });

		await client.emailOtp.requestPasswordReset({ email });

		const res1 = await client.emailOtp.resetPassword({
			email,
			otp,
			password: "newpass1",
		});
		expect(res1.data?.success).toBe(true);

		const verificationValue =
			await authCtx.internalAdapter.findVerificationValue(
				`forget-password-otp-${email}`,
			);
		expect(verificationValue).toBeNull();

		const res2 = await client.emailOtp.resetPassword({
			email,
			otp,
			password: "newpass2",
		});
		expect(res2.error?.code).toBe("INVALID_OTP");
	});
});

describe("email-otp-resendStrategy", async () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	const otps: string[] = [];
	const { client, testUser } = await getTestInstance(
		{
			plugins: [
				emailOTP({
					async sendVerificationOTP({ otp }) {
						otps.push(otp);
					},
					resendStrategy: "reuse",
				}),
			],
		},
		{
			clientOptions: {
				plugins: [emailOTPClient()],
			},
		},
	);

	it("should reuse existing OTP when resendStrategy is reuse", async () => {
		otps.length = 0;
		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		const firstOtp = otps[0];
		expect(firstOtp).toBeDefined();

		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "email-verification",
		});
		const secondOtp = otps[1];
		expect(secondOtp).toBeDefined();
		expect(secondOtp).toBe(firstOtp);
	});

	it("should generate new OTP after previous one expires", async () => {
		otps.length = 0;
		vi.useFakeTimers();

		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "sign-in",
		});
		const firstOtp = otps[0];
		expect(firstOtp).toBeDefined();

		// Advance past expiry (default 5 minutes)
		await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

		await client.emailOtp.sendVerificationOtp({
			email: testUser.email,
			type: "sign-in",
		});
		const secondOtp = otps[1];
		expect(secondOtp).toBeDefined();
		expect(secondOtp).not.toBe(firstOtp);
	});

	it("should generate new OTP when resendStrategy is reuse but storeOTP is hashed", async () => {
		const hashedOtps: string[] = [];
		const { client: hashedClient, testUser: hashedUser } =
			await getTestInstance(
				{
					plugins: [
						emailOTP({
							async sendVerificationOTP({ otp }) {
								hashedOtps.push(otp);
							},
							resendStrategy: "reuse",
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

		await hashedClient.emailOtp.sendVerificationOtp({
			email: hashedUser.email,
			type: "email-verification",
		});
		const firstOtp = hashedOtps[0];
		expect(firstOtp).toBeDefined();

		// Second request - should get NEW OTP since hashed OTP cannot be retrieved
		await hashedClient.emailOtp.sendVerificationOtp({
			email: hashedUser.email,
			type: "email-verification",
		});
		const secondOtp = hashedOtps[1];
		expect(secondOtp).toBeDefined();
		expect(secondOtp).not.toBe(firstOtp);
	});

	it("should generate new OTP when resendStrategy is reuse but storeOTP is custom hash", async () => {
		const customHashOtps: string[] = [];
		const { client: hashClient, testUser: hashUser } = await getTestInstance(
			{
				plugins: [
					emailOTP({
						async sendVerificationOTP({ otp }) {
							customHashOtps.push(otp);
						},
						resendStrategy: "reuse",
						storeOTP: {
							hash: async (otp) => `hashed-${otp}`,
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

		await hashClient.emailOtp.sendVerificationOtp({
			email: hashUser.email,
			type: "email-verification",
		});
		const firstOtp = customHashOtps[0];
		expect(firstOtp).toBeDefined();

		await hashClient.emailOtp.sendVerificationOtp({
			email: hashUser.email,
			type: "email-verification",
		});
		const secondOtp = customHashOtps[1];
		expect(secondOtp).toBeDefined();
		expect(secondOtp).not.toBe(firstOtp);
	});

	it("should not send OTP for non-existent user on email-verification type", async () => {
		otps.length = 0;
		const { client: noSignUpClient } = await getTestInstance(
			{
				plugins: [
					emailOTP({
						async sendVerificationOTP({ otp }) {
							otps.push(otp);
						},
						resendStrategy: "reuse",
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

		const res = await noSignUpClient.emailOtp.sendVerificationOtp({
			email: "nonexistent@test.com",
			type: "email-verification",
		});
		expect(res.data?.success).toBe(true);
		// OTP should not be sent since user doesn't exist
		expect(otps.length).toBe(0);
	});

	it("should generate fresh OTP when attempts are exhausted", async () => {
		otps.length = 0;
		const { client: attemptClient, testUser: attemptUser } =
			await getTestInstance(
				{
					plugins: [
						emailOTP({
							async sendVerificationOTP({ otp }) {
								otps.push(otp);
							},
							resendStrategy: "reuse",
							allowedAttempts: 2,
						}),
					],
				},
				{
					clientOptions: {
						plugins: [emailOTPClient()],
					},
				},
			);

		// Send first OTP
		await attemptClient.emailOtp.sendVerificationOtp({
			email: attemptUser.email,
			type: "email-verification",
		});
		const firstOtp = otps[0];
		expect(firstOtp).toBeDefined();

		// Exhaust attempts by verifying with wrong OTP
		await attemptClient.emailOtp.verifyEmail({
			email: attemptUser.email,
			otp: "wrong1",
		});
		await attemptClient.emailOtp.verifyEmail({
			email: attemptUser.email,
			otp: "wrong2",
		});

		// Request new OTP — should generate fresh one since attempts exhausted
		await attemptClient.emailOtp.sendVerificationOtp({
			email: attemptUser.email,
			type: "email-verification",
		});
		const secondOtp = otps[1];
		expect(secondOtp).toBeDefined();
		expect(secondOtp).not.toBe(firstOtp);
	});
});
