import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { bearer } from "../bearer";
import { phoneNumber } from ".";
import { phoneNumberClient } from "./client";

describe("phone-number", async (it) => {
	let otp = "";

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const headers = new Headers();

	const testPhoneNumber = "+251911121314";
	it("should send verification code", async () => {
		const res = await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		expect(res.error).toBe(null);
		expect(otp).toHaveLength(6);
	});

	it("should verify phone number", async () => {
		const res = await client.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
	});

	it("shouldn't verify again with the same code", async () => {
		const res = await client.phoneNumber.verify({
			phoneNumber: testPhoneNumber,
			code: otp,
		});
		expect(res.error?.status).toBe(400);
	});

	it("should update phone number", async () => {
		const newPhoneNumber = "+0123456789";
		await client.phoneNumber.sendOtp({
			phoneNumber: newPhoneNumber,
			fetchOptions: {
				headers,
			},
		});
		await client.phoneNumber.verify({
			phoneNumber: newPhoneNumber,
			updatePhoneNumber: true,
			code: otp,
			fetchOptions: {
				headers,
			},
		});
		const user = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(user.data?.user.phoneNumber).toBe(newPhoneNumber);
		expect(user.data?.user.phoneNumberVerified).toBe(true);
	});

	it("should not verify if code expired", async () => {
		vi.useFakeTimers();
		await client.phoneNumber.sendOtp({
			phoneNumber: "+25120201212",
		});
		vi.advanceTimersByTime(1000 * 60 * 5 + 1); // 5 minutes + 1ms
		const res = await client.phoneNumber.verify({
			phoneNumber: "+25120201212",
			code: otp,
		});
		expect(res.error?.status).toBe(400);
	});
});

describe("phone auth flow", async () => {
	let otp = "";

	const { client, sessionSetter, auth } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
				bearer(),
			],
			user: {
				changeEmail: {
					enabled: true,
					updateEmailWithoutVerification: true,
				},
			},
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	it("should send otp", async () => {
		const res = await client.phoneNumber.sendOtp({
			phoneNumber: "+251911121314",
		});
		expect(res.error).toBe(null);
		expect(otp).toHaveLength(6);
	});

	it("should verify phone number and create user & session", async () => {
		const res = await client.phoneNumber.verify({
			phoneNumber: "+251911121314",
			code: otp,
		});
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${res.data?.token}`,
				},
				throw: true,
			},
		});
		expect(session?.user.phoneNumberVerified).toBe(true);
		expect(session?.user.email).toBe("temp-+251911121314");
		expect(session?.session.token).toBeDefined();
	});

	let headers = new Headers();
	it("should go through send-verify and sign-in the user", async () => {
		await client.phoneNumber.sendOtp({
			phoneNumber: "+251911121314",
		});
		const res = await client.phoneNumber.verify(
			{
				phoneNumber: "+251911121314",
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.data?.status).toBe(true);
	});

	const newEmail = "new-email@email.com";
	it("should set password and update user", async () => {
		await auth.api.setPassword({
			body: {
				newPassword: "password",
			},
			headers,
		});
		const changedEmailRes = await client.changeEmail({
			newEmail,
			fetchOptions: {
				headers,
			},
		});
		expect(changedEmailRes.error).toBe(null);
		expect(changedEmailRes.data?.status).toBe(true);
	});

	it("should sign in with phone number and password", async () => {
		const res = await client.signIn.phoneNumber({
			phoneNumber: "+251911121314",
			password: "password",
		});
		expect(res.data?.token).toBeDefined();
	});

	it("should sign in with new email", async () => {
		const res = await client.signIn.email({
			email: newEmail,
			password: "password",
		});
		expect(res.error).toBe(null);
	});
});

describe("verify phone-number", async (it) => {
	let otp = "";

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
					allowedAttempts: 3,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const headers = new Headers();

	const testPhoneNumber = "+251911121314";

	it("should verify the last code", async () => {
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		vi.useFakeTimers();
		vi.advanceTimersByTime(1000);
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		vi.advanceTimersByTime(1000);
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		const res = await client.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
	});

	it("should block after exceeding allowed attempts", async () => {
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		for (let i = 0; i < 3; i++) {
			const res = await client.phoneNumber.verify({
				phoneNumber: testPhoneNumber,
				code: "000000",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");
		}

		//Try one more time - should be blocked
		const res = await client.phoneNumber.verify({
			phoneNumber: testPhoneNumber,
			code: "000000",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Too many attempts");
	});
});

describe("reset password flow attempts", async (it) => {
	let otp = "";
	let resetOtp = "";

	const { client } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					sendPasswordResetOTP(data, request) {
						resetOtp = data.code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
					allowedAttempts: 3,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+251911121314";

	it("should block reset password after exceeding allowed attempts", async () => {
		//register phone number
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		await client.phoneNumber.verify({
			phoneNumber: testPhoneNumber,
			code: otp,
		});

		await client.phoneNumber.requestPasswordReset({
			phoneNumber: testPhoneNumber,
		});

		for (let i = 0; i < 3; i++) {
			const res = await client.phoneNumber.resetPassword({
				phoneNumber: testPhoneNumber,
				otp: otp,
				password: "password",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");
		}

		const res = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: otp,
			password: "password",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Too many attempts");
	});

	it("should successfully reset password with correct code", async () => {
		await client.phoneNumber.requestPasswordReset({
			phoneNumber: testPhoneNumber,
		});

		const resetPasswordRes = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: resetOtp,
			password: "password",
		});

		expect(resetPasswordRes.error).toBe(null);
		expect(resetPasswordRes.data?.status).toBe(true);
	});

	it("shouldn't allow to re-use the same OTP code", async () => {
		const res = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: resetOtp,
			password: "password",
		});
		expect(res.error?.status).toBe(400);
	});
});

describe("reset password session revocation", async (it) => {
	let otp = "";
	let resetOtp = "";

	const { client, sessionSetter } = await getTestInstance(
		{
			emailAndPassword: {
				enabled: true,
				revokeSessionsOnPasswordReset: true,
			},
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					sendPasswordResetOTP(data, request) {
						resetOtp = data.code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+251911000000";

	it("should revoke all sessions after password reset when configured", async () => {
		const headers = new Headers();

		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		const verifyRes = await client.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		expect(verifyRes.error).toBe(null);

		const sessionBefore = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionBefore.data?.user).toBeTruthy();

		await client.phoneNumber.requestPasswordReset({
			phoneNumber: testPhoneNumber,
		});

		const resetRes = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: resetOtp,
			password: "new-secure-password",
		});

		expect(resetRes.error).toBe(null);
		expect(resetRes.data?.status).toBe(true);

		const sessionAfter = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAfter.data).toBe(null);
	});
});

describe("phone number verification requirement", async () => {
	let otp = "";
	const { client } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					requireVerification: true,
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
			user: {
				changeEmail: {
					enabled: true,
				},
			},
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+251911121314";
	const testPassword = "password123";
	const testEmail = "test2@test.com";

	it("should not allow sign in with unverified phone number and trigger OTP send", async () => {
		await client.signUp.email({
			email: testEmail,
			password: testPassword,
			name: "test",
			phoneNumber: testPhoneNumber,
		});
		const signInRes = await client.signIn.phoneNumber({
			phoneNumber: testPhoneNumber,
			password: testPassword,
		});
		expect(signInRes.error?.status).toBe(401);
		expect(signInRes.error?.code).toMatch("PHONE_NUMBER_NOT_VERIFIED");
		expect(otp).toHaveLength(6);
	});
});

describe("updateUser phone number update prevention", async () => {
	let otp = "";

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const headers = new Headers();
	const initialPhoneNumber = "+251911121314";
	const newPhoneNumber = "+9876543210";

	it("should prevent updating phone number via updateUser", async () => {
		// First, verify a phone number to set phoneNumberVerified to true
		await client.phoneNumber.sendOtp({
			phoneNumber: initialPhoneNumber,
		});
		const verifyRes = await client.phoneNumber.verify(
			{
				phoneNumber: initialPhoneNumber,
				code: otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(verifyRes.error).toBe(null);
		expect(verifyRes.data?.status).toBe(true);

		// Verify that phoneNumberVerified is true after verification
		const sessionBeforeUpdate = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionBeforeUpdate.data?.user.phoneNumberVerified).toBe(true);
		expect(sessionBeforeUpdate.data?.user.phoneNumber).toBe(initialPhoneNumber);

		// Attempt to update the phone number via updateUser - should throw an error
		const updateRes = await client.updateUser({
			phoneNumber: newPhoneNumber,
			fetchOptions: {
				headers,
			},
		});
		expect(updateRes.error).not.toBe(null);
		expect(updateRes.error?.status).toBe(400);
		expect(updateRes.error?.message).toBe("Phone number cannot be updated");

		// Verify that the phone number hasn't changed and phoneNumberVerified is still true
		const sessionAfterUpdate = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAfterUpdate.data?.user.phoneNumberVerified).toBe(true);
		expect(sessionAfterUpdate.data?.user.phoneNumber).toBe(initialPhoneNumber);
	});
});

describe("custom verifyOTP", async () => {
	const mockVerifyOTP = vi.fn();

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP() {},
					verifyOTP: mockVerifyOTP,
					signUpOnVerification: {
						getTempEmail(phoneNumber) {
							return `temp-${phoneNumber}`;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const headers = new Headers();
	const testPhoneNumber = "+1234567890";

	it("should call custom verifyOTP when provided", async () => {
		// Send OTP first
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		// Mock verifyOTP to return true (valid)
		mockVerifyOTP.mockResolvedValueOnce(true);

		const res = await client.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: "123456", // Any code
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(mockVerifyOTP).toHaveBeenCalledWith(
			{
				phoneNumber: testPhoneNumber,
				code: "123456",
			},
			expect.anything(),
		);
	});

	it("should reject verification when custom verifyOTP returns false", async () => {
		const newPhoneNumber = "+9876543210";
		await client.phoneNumber.sendOtp({
			phoneNumber: newPhoneNumber,
		});

		// Mock verifyOTP to return false (invalid)
		mockVerifyOTP.mockResolvedValueOnce(false);

		const res = await client.phoneNumber.verify({
			phoneNumber: newPhoneNumber,
			code: "wrong-code",
		});

		expect(res.error).not.toBe(null);
		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toBe("Invalid OTP");
		expect(mockVerifyOTP).toHaveBeenCalledWith(
			{
				phoneNumber: newPhoneNumber,
				code: "wrong-code",
			},
			expect.anything(),
		);
	});

	it("should not use internal verification logic when custom verifyOTP is provided", async () => {
		const anotherPhoneNumber = "+5555555555";

		// Don't send OTP through sendOtp endpoint (simulating external SMS provider)
		// This means there's no OTP in the database

		// Mock verifyOTP to return true
		mockVerifyOTP.mockResolvedValueOnce(true);

		const res = await client.phoneNumber.verify({
			phoneNumber: anotherPhoneNumber,
			code: "external-code",
		});

		// Should succeed because custom verifyOTP is used, not internal DB lookup
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(mockVerifyOTP).toHaveBeenCalledWith(
			{
				phoneNumber: anotherPhoneNumber,
				code: "external-code",
			},
			expect.anything(),
		);
	});

	it("should work with updatePhoneNumber using custom verifyOTP", async () => {
		const updatedPhoneNumber = "+1111111111";

		// Mock verifyOTP to return true
		mockVerifyOTP.mockResolvedValueOnce(true);

		const res = await client.phoneNumber.verify({
			phoneNumber: updatedPhoneNumber,
			code: "123456",
			updatePhoneNumber: true,
			fetchOptions: {
				headers,
			},
		});

		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);

		// Verify phone number was updated
		const user = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(user.data?.user.phoneNumber).toBe(updatedPhoneNumber);
		expect(user.data?.user.phoneNumberVerified).toBe(true);
	});
});

describe("new phone-number API - sendVerificationOTP", async (it) => {
	let otp = "";

	const { client } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code, type }) {
						otp = code;
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+251911121314";

	it("should send OTP for phone-number-verification type", async () => {
		const res = await client.phoneNumber.sendVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "phone-number-verification",
		});
		expect(res.error).toBe(null);
		expect(res.data?.success).toBe(true);
		expect(otp).toHaveLength(6);
	});

	it("should send OTP for sign-in type", async () => {
		const res = await client.phoneNumber.sendVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "sign-in",
		});
		expect(res.error).toBe(null);
		expect(res.data?.success).toBe(true);
		expect(otp).toHaveLength(6);
	});

	it("should send OTP for forget-password type", async () => {
		const res = await client.phoneNumber.sendVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "forget-password",
		});
		expect(res.error).toBe(null);
		expect(res.data?.success).toBe(true);
		expect(otp).toHaveLength(6);
	});
});

describe("new phone-number API - checkVerificationOTP", async (it) => {
	const testPhoneNumber = "+251911121314";

	it("should check OTP without deleting it", async () => {
		let otp = "";
		const { client } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							otp = code;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		await client.phoneNumber.sendVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "forget-password",
		});

		const checkRes = await client.phoneNumber.checkVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "forget-password",
			otp,
		});
		expect(checkRes.error).toBe(null);
		expect(checkRes.data?.success).toBe(true);

		// OTP should still be valid after check (not deleted)
		const checkRes2 = await client.phoneNumber.checkVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "forget-password",
			otp,
		});
		expect(checkRes2.error).toBe(null);
		expect(checkRes2.data?.success).toBe(true);
	});

	it("should check OTP without requiring user existence (password reset flow)", async () => {
		let otp = "";
		const nonExistentPhone = "+9999999999";
		const { client } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							otp = code;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		await client.phoneNumber.sendVerificationOtp({
			phoneNumber: nonExistentPhone,
			type: "forget-password",
		});

		const checkRes = await client.phoneNumber.checkVerificationOtp({
			phoneNumber: nonExistentPhone,
			type: "forget-password",
			otp,
		});
		expect(checkRes.error).toBe(null);
		expect(checkRes.data?.success).toBe(true);
	});

	it("should reject invalid OTP", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP() {
							// OTP is not needed for this test
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		await client.phoneNumber.sendVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "sign-in",
		});

		const checkRes = await client.phoneNumber.checkVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "sign-in",
			otp: "000000",
		});
		expect(checkRes.error).not.toBe(null);
		expect(checkRes.error?.status).toBe(400);
		expect(checkRes.error?.message).toBe("Invalid OTP");
	});

	it("should track attempts correctly", async () => {
		const testPhone = "+6666666666";
		const { client } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP() {
							// OTP is not needed for this test
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		await client.phoneNumber.sendVerificationOtp({
			phoneNumber: testPhone,
			type: "phone-number-verification",
		});

		// Try wrong OTP 3 times (allowedAttempts default is 3)
		for (let i = 0; i < 3; i++) {
			const res = await client.phoneNumber.checkVerificationOtp({
				phoneNumber: testPhone,
				type: "phone-number-verification",
				otp: "000000",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");
		}

		// 4th attempt should be blocked (exceeds allowedAttempts)
		const res = await client.phoneNumber.checkVerificationOtp({
			phoneNumber: testPhone,
			type: "phone-number-verification",
			otp: "000000",
		});
		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe("Too many attempts");
	});
});

describe("new phone-number API - signInPhoneNumberOtp", async (it) => {
	it("should sign in with OTP and create session", async () => {
		let otp = "";
		const testPhoneNumber = "+251911121314";
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							otp = code;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		const headers = new Headers();
		await client.phoneNumber.sendVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "sign-in",
		});

		const res = await client.signIn.phoneNumberOtp(
			{
				phoneNumber: testPhoneNumber,
				otp,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.error).toBe(null);
		expect(res.data?.token).toBeDefined();
		expect(res.data?.user).toBeDefined();
		expect(res.data?.user.phoneNumber).toBe(testPhoneNumber);
		expect(res.data?.user.phoneNumberVerified).toBe(true);

		// Verify session was created
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user.phoneNumber).toBe(testPhoneNumber);
		expect(session.data?.user.phoneNumberVerified).toBe(true);
	});

	it("should auto sign-up when disableSignUp is false", async () => {
		let newOtp = "";
		const { client: testClient } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							newOtp = code;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		const newPhone = "+9876543210";
		await testClient.phoneNumber.sendVerificationOtp({
			phoneNumber: newPhone,
			type: "sign-in",
		});

		const res = await testClient.signIn.phoneNumberOtp({
			phoneNumber: newPhone,
			otp: newOtp,
		});
		expect(res.error).toBe(null);
		expect(res.data?.token).toBeDefined();
		expect(res.data?.user.phoneNumber).toBe(newPhone);
	});

	it("should not sign up when disableSignUp is true", async () => {
		let otp = "";
		const newPhone = "+1111111111";
		const { client: clientWithDisabledSignUp } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							otp = code;
						},
						disableSignUp: true,
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		// Send OTP for sign-in - should return success but not actually create/send OTP
		// (to prevent user enumeration when disableSignUp is true)
		const sendRes =
			await clientWithDisabledSignUp.phoneNumber.sendVerificationOtp({
				phoneNumber: newPhone,
				type: "sign-in",
			});
		expect(sendRes.error).toBe(null);
		expect(sendRes.data?.success).toBe(true);
		// OTP should not be set because it was deleted to prevent enumeration
		expect(otp).toBe("");

		// Try to sign in with OTP - should fail because OTP was never created
		const res = await clientWithDisabledSignUp.signIn.phoneNumberOtp({
			phoneNumber: newPhone,
			otp: "123456", // Any OTP since none was created
		});
		expect(res.error).not.toBe(null);
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("OTP_NOT_FOUND");
	});
});

describe("new phone-number API - verifyPhoneNumberNew", async (it) => {
	it("should verify phone number without creating session by default", async () => {
		let otp = "";
		const testPhoneNumber = "+251911121314";
		const { client } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							otp = code;
						},
						signUpOnVerification: {
							getTempEmail(phoneNumber) {
								return `temp-${phoneNumber}@example.com`;
							},
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		await client.phoneNumber.sendVerificationOtp({
			phoneNumber: testPhoneNumber,
			type: "phone-number-verification",
		});

		const res = await client.phoneNumber.verifyPhoneNumber({
			phoneNumber: testPhoneNumber,
			otp,
			disableSession: true,
		});
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(res.data?.token).toBe(null);
		expect(res.data?.user).not.toBe(null);
		expect(res.data?.user?.phoneNumberVerified).toBe(true);
	});

	it("should create session when disableSession is false", async () => {
		let otp = "";
		const newPhone = "+2222222222";
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							otp = code;
						},
						signUpOnVerification: {
							getTempEmail(phoneNumber) {
								return `temp-${phoneNumber}@example.com`;
							},
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		const headers = new Headers();
		await client.phoneNumber.sendVerificationOtp({
			phoneNumber: newPhone,
			type: "phone-number-verification",
		});

		const res = await client.phoneNumber.verifyPhoneNumber(
			{
				phoneNumber: newPhone,
				otp,
				disableSession: false,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(res.data?.token).toBeDefined();
		expect(res.data?.user).toBeDefined();

		// Verify session was actually created
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user.phoneNumber).toBe(newPhone);
		expect(session.data?.user.phoneNumberVerified).toBe(true);
	});

	it("should update phone number when updatePhoneNumber is true", async () => {
		let initialOtp = "";
		let newOtp = "";
		const { client: testClient, sessionSetter: testSessionSetter } =
			await getTestInstance(
				{
					plugins: [
						phoneNumber({
							async sendOTP({ code, type }) {
								if (type === "phone-number-verification") {
									if (!initialOtp) {
										initialOtp = code;
									} else {
										newOtp = code;
									}
								}
							},
							signUpOnVerification: {
								getTempEmail(phoneNumber) {
									return `temp-${phoneNumber}@example.com`;
								},
							},
						}),
					],
				},
				{
					clientOptions: {
						plugins: [phoneNumberClient()],
					},
				},
			);

		const testHeaders = new Headers();
		// First create a user and session
		const initialPhone = "+1111111111";
		await testClient.phoneNumber.sendVerificationOtp({
			phoneNumber: initialPhone,
			type: "phone-number-verification",
		});

		const verifyRes = await testClient.phoneNumber.verifyPhoneNumber(
			{
				phoneNumber: initialPhone,
				otp: initialOtp,
				disableSession: false,
			},
			{
				onSuccess: testSessionSetter(testHeaders),
			},
		);
		expect(verifyRes.error).toBe(null);
		expect(verifyRes.data?.token).toBeDefined();

		// Verify session exists
		const sessionCheck = await testClient.getSession({
			fetchOptions: {
				headers: testHeaders,
			},
		});
		expect(sessionCheck.data?.user).toBeDefined();

		// Now update to a new phone number
		const newPhone = "+3333333333";
		await testClient.phoneNumber.sendVerificationOtp({
			phoneNumber: newPhone,
			type: "phone-number-verification",
		});

		const res = await testClient.phoneNumber.verifyPhoneNumber(
			{
				phoneNumber: newPhone,
				otp: newOtp,
				updatePhoneNumber: true,
				fetchOptions: {
					headers: testHeaders,
				},
			},
			{
				onSuccess: testSessionSetter(testHeaders),
			},
		);
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);

		const user = await testClient.getSession({
			fetchOptions: {
				headers: testHeaders,
			},
		});
		expect(user.data?.user.phoneNumber).toBe(newPhone);
	});
});

describe("new phone-number API - password reset flow", async (it) => {
	it("should support 3-step password reset flow", async () => {
		let otp = "";
		let resetOtp = "";
		const { client: testClient, auth } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							otp = code;
						},
						sendPasswordResetOTP({ code }) {
							resetOtp = code;
						},
						signUpOnVerification: {
							getTempEmail(phoneNumber) {
								return `temp-${phoneNumber}@example.com`;
							},
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		const testPhone = "+8888888888";
		// First create a user with phone number and set a password
		await testClient.phoneNumber.sendOtp({
			phoneNumber: testPhone,
		});
		const verifyRes = await testClient.phoneNumber.verify({
			phoneNumber: testPhone,
			code: otp,
		});
		expect(verifyRes.error).toBe(null);

		// Set a password for the user
		const headers = new Headers();
		headers.set("Authorization", `Bearer ${verifyRes.data?.token}`);
		await auth.api.setPassword({
			body: {
				newPassword: "initialPassword",
			},
			headers,
		});

		// Step 1: Request password reset
		const requestRes = await testClient.phoneNumber.requestPasswordReset({
			phoneNumber: testPhone,
		});
		expect(requestRes.error).toBe(null);
		// runInBackgroundOrAwait should await the callback, so OTP should be set immediately
		expect(resetOtp).toHaveLength(6);

		// Step 2: Check OTP (optional, provides early feedback)
		const checkRes = await testClient.phoneNumber.checkVerificationOtp({
			phoneNumber: testPhone,
			type: "forget-password",
			otp: resetOtp,
		});
		expect(checkRes.error).toBe(null);
		expect(checkRes.data?.success).toBe(true);

		// Step 3: Reset password
		const resetRes = await testClient.phoneNumber.resetPassword({
			phoneNumber: testPhone,
			otp: resetOtp,
			password: "newPassword123",
		});
		expect(resetRes.error).toBe(null);
		expect(resetRes.data?.status).toBe(true);
	});

	it("should accept both password and newPassword parameters", async () => {
		let otp = "";
		let resetOtp1 = "";
		let resetOtp2 = "";
		let resetCallCount = 0;
		const { client: testClient, auth } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							otp = code;
						},
						sendPasswordResetOTP({ code }) {
							resetCallCount++;
							if (resetCallCount === 1) {
								resetOtp1 = code;
							} else {
								resetOtp2 = code;
							}
						},
						signUpOnVerification: {
							getTempEmail(phoneNumber) {
								return `temp-${phoneNumber}@example.com`;
							},
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		const testPhone = "+7777777777";
		// First create a user with phone number and set a password
		await testClient.phoneNumber.sendOtp({
			phoneNumber: testPhone,
		});
		const verifyRes = await testClient.phoneNumber.verify({
			phoneNumber: testPhone,
			code: otp,
		});
		expect(verifyRes.error).toBe(null);

		// Set a password for the user
		const headers = new Headers();
		headers.set("Authorization", `Bearer ${verifyRes.data?.token}`);
		await auth.api.setPassword({
			body: {
				newPassword: "initialPassword",
			},
			headers,
		});

		// Test with password parameter
		await testClient.phoneNumber.requestPasswordReset({
			phoneNumber: testPhone,
		});
		// runInBackgroundOrAwait should await the callback
		expect(resetOtp1).toHaveLength(6);

		const res1 = await testClient.phoneNumber.resetPassword({
			phoneNumber: testPhone,
			otp: resetOtp1,
			password: "newPassword456",
		});
		expect(res1.error).toBe(null);

		// Request again for second test
		await testClient.phoneNumber.requestPasswordReset({
			phoneNumber: testPhone,
		});
		// runInBackgroundOrAwait should await the callback
		expect(resetOtp2).toHaveLength(6);

		// Test with newPassword parameter (backward compat)
		const res2 = await testClient.phoneNumber.resetPassword({
			phoneNumber: testPhone,
			otp: resetOtp2,
			password: undefined as any,
			newPassword: "newPassword789",
		});
		expect(res2.error).toBe(null);
	});
});

describe("backward compatibility - old API still works", async (it) => {
	let otp = "";

	const { client } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						otp = code;
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [phoneNumberClient()],
			},
		},
	);

	const testPhoneNumber = "+251911121314";

	it("should work with old sendOtp method", async () => {
		const res = await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});
		expect(res.error).toBe(null);
		expect(otp).toHaveLength(6);
	});

	it("should work with old verify method (creates session by default)", async () => {
		let verifyOtp = "";
		const { client: testClient, sessionSetter: testSessionSetter } =
			await getTestInstance(
				{
					plugins: [
						phoneNumber({
							async sendOTP({ code }) {
								verifyOtp = code;
							},
							signUpOnVerification: {
								getTempEmail(phoneNumber) {
									return `temp-${phoneNumber}@example.com`;
								},
							},
						}),
					],
				},
				{
					clientOptions: {
						plugins: [phoneNumberClient()],
					},
				},
			);

		const testHeaders = new Headers();
		await testClient.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		const res = await testClient.phoneNumber.verify(
			{
				phoneNumber: testPhoneNumber,
				code: verifyOtp,
			},
			{
				onSuccess: testSessionSetter(testHeaders),
			},
		);
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(res.data?.token).toBeDefined();
	});

	it("should work with old verify method using otp parameter", async () => {
		let verifyOtp = "";
		const { client: testClient } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							verifyOtp = code;
						},
						signUpOnVerification: {
							getTempEmail(phoneNumber) {
								return `temp-${phoneNumber}@example.com`;
							},
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		const newPhone = "+4444444444";
		await testClient.phoneNumber.sendOtp({
			phoneNumber: newPhone,
		});

		const res = await testClient.phoneNumber.verify({
			phoneNumber: newPhone,
			otp: verifyOtp,
		});
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
	});

	it("should work with old verify method with disableSession", async () => {
		let verifyOtp = "";
		const { client: testClient } = await getTestInstance(
			{
				plugins: [
					phoneNumber({
						async sendOTP({ code }) {
							verifyOtp = code;
						},
						signUpOnVerification: {
							getTempEmail(phoneNumber) {
								return `temp-${phoneNumber}@example.com`;
							},
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [phoneNumberClient()],
				},
			},
		);

		const newPhone = "+5555555555";
		await testClient.phoneNumber.sendOtp({
			phoneNumber: newPhone,
		});

		const res = await testClient.phoneNumber.verify({
			phoneNumber: newPhone,
			code: verifyOtp,
			disableSession: true,
		});
		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
		expect(res.data?.token).toBe(null);
	});
});
