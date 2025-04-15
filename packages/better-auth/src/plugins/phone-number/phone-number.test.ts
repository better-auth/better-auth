import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { phoneNumber } from ".";
import { createAuthClient } from "../../client";
import { phoneNumberClient } from "./client";
import { bearer } from "../bearer";

describe("phone-number", async (it) => {
	let otp = "";

	const { customFetchImpl, sessionSetter } = await getTestInstance({
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
	});

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [phoneNumberClient()],
		fetchOptions: {
			customFetchImpl,
		},
	});

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

	const { customFetchImpl, sessionSetter, auth } = await getTestInstance({
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
			},
		},
	});

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [phoneNumberClient()],
		fetchOptions: {
			customFetchImpl,
		},
	});

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
		expect(session.user.phoneNumberVerified).toBe(true);
		expect(session.user.email).toBe("temp-+251911121314");
		expect(session.session.token).toBeDefined();
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
		expect(res.error).toBe(null);
	});
});

describe("verify phone-number", async (it) => {
	let otp = "";

	const { customFetchImpl, sessionSetter } = await getTestInstance({
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
	});

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [phoneNumberClient()],
		fetchOptions: {
			customFetchImpl,
		},
	});

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

	const { customFetchImpl, sessionSetter } = await getTestInstance({
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
	});

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [phoneNumberClient()],
		fetchOptions: {
			customFetchImpl,
		},
	});

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

		await client.phoneNumber.forgetPassword({
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
		await client.phoneNumber.sendOtp({
			phoneNumber: testPhoneNumber,
		});

		const res = await client.phoneNumber.verify({
			phoneNumber: testPhoneNumber,
			code: otp,
		});

		expect(res.error).toBe(null);
		expect(res.data?.status).toBe(true);
	});
});

describe("phone number verification requirement", async () => {
	let otp = "";
	const { customFetchImpl } = await getTestInstance({
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
	});

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [phoneNumberClient()],
		fetchOptions: {
			customFetchImpl,
		},
	});

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
