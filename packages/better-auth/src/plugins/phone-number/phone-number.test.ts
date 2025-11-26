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
		const res = await client.phoneNumber.verify({
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
		const res = await auth.api.setPassword({
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
		console.log(res);
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

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						console.log("sendOTP", code);
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
				newPassword: "password",
			});
			expect(res.error?.status).toBe(400);
			expect(res.error?.message).toBe("Invalid OTP");
		}

		const res = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: otp,
			newPassword: "password",
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
			newPassword: "password",
		});

		expect(resetPasswordRes.error).toBe(null);
		expect(resetPasswordRes.data?.status).toBe(true);
	});

	it("shouldn't allow to re-use the same OTP code", async () => {
		const res = await client.phoneNumber.resetPassword({
			phoneNumber: testPhoneNumber,
			otp: resetOtp,
			newPassword: "password",
		});
		expect(res.error?.status).toBe(400);
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
	let sentCode = "";

	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				phoneNumber({
					async sendOTP({ code }) {
						sentCode = code;
					},
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
