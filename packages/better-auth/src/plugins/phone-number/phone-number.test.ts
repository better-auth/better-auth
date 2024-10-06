import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { phoneNumber } from ".";
import { createAuthClient } from "../../client";
import { phoneNumberClient } from "./client";

describe("phone-number", async (it) => {
	let otp = "";

	const { customFetchImpl, sessionSetter } = await getTestInstance({
		plugins: [
			phoneNumber({
				otp: {
					async sendOTP(_, code) {
						otp = code;
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

	it("should sign-up with phone number", async () => {
		const res = await client.signUp.phoneNumber({
			email: "valid-email@email.com",
			name: "Test User",
			phoneNumber: "+251911121314",
			password: "valid-password",
		});

		expect(res.data).toMatchObject({
			user: {
				id: expect.any(String),
				name: "Test User",
				email: "valid-email@email.com",
				emailVerified: false,
				image: null,
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
				phoneNumber: "+251911121314",
			},
			session: {
				id: expect.any(String),
				userId: expect.any(String),
				expiresAt: expect.any(String),
				ipAddress: "",
				userAgent: "",
			},
		});
	});

	it("should sing-in with phone-number", async () => {
		const res = await client.signIn.phoneNumber(
			{
				phoneNumber: "+251911121314",
				password: "valid-password",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		expect(res.data).toMatchObject({
			user: {
				id: expect.any(String),
				name: "Test User",
				email: "valid-email@email.com",
				emailVerified: false,
				image: null,
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
				phoneNumber: "+251911121314",
			},
			session: {
				id: expect.any(String),
				userId: expect.any(String),
				expiresAt: expect.any(String),
				ipAddress: "",
				userAgent: "",
			},
		});
	});

	it("should send verification code", async () => {
		await client.phoneNumber.sendVerificationCode({
			phoneNumber: "+251911121314",
		});
		expect(otp).toHaveLength(6);
	});

	it("should verify phone number", async () => {
		const res = await client.phoneNumber.verify({
			phoneNumber: "+251911121314",
			code: otp,
		});
		const user = await client.session({
			fetchOptions: {
				headers,
			},
		});
		expect(res.error).toBe(null);
		expect(user.data?.user.phoneNumberVerified).toBe(true);
	});

	it("shouldn't verify again with the same code", async () => {
		const res = await client.phoneNumber.verify({
			phoneNumber: "+251911121314",
			code: otp,
		});
		expect(res.error?.status).toBe(400);
	});

	it("should update phone number", async () => {
		const newPhoneNumber = "+25120201212";
		await client.phoneNumber.update({
			phoneNumber: newPhoneNumber,
			fetchOptions: {
				headers,
			},
		});
		const user = await client.session({
			fetchOptions: {
				headers,
			},
		});
		expect(user.data?.user.phoneNumber).toBe(newPhoneNumber);
		expect(user.data?.user.phoneNumberVerified).toBe(false);
	});

	it("should not verify if code expired", async () => {
		vi.useFakeTimers();
		await client.phoneNumber.sendVerificationCode({
			phoneNumber: "+25120201212",
		});
		vi.advanceTimersByTime(1000 * 60 * 5 + 1); // 5 minutes + 1ms
		const res = await client.phoneNumber.verify({
			phoneNumber: "+25120201212",
			code: otp,
		});
		expect(res.error?.status).toBe(400);
	});

	it("should work with custom config", async () => {
		let otpCode = "";
		const { auth } = await getTestInstance({
			plugins: [
				phoneNumber({
					otp: {
						sendOTPonSignUp: true,
						otpLength: 4,
						async sendOTP(_, code) {
							otpCode = code;
						},
						expiresIn: 120,
					},
				}),
			],
		});
		await auth.api.signUpPhoneNumber({
			body: {
				email: "test@email.com",
				phoneNumber: "+25120201212",
				password: "password",
				name: "test",
			},
		});

		expect(otpCode).toHaveLength(4);
		vi.useFakeTimers();
		vi.advanceTimersByTime(1000 * 60 * 2);
		const res = await auth.api.verifyPhoneNumber({
			body: {
				phoneNumber: "+25120201212",
				code: otpCode,
			},
		});
		expect(res.user.phoneNumberVerified).toBe(true);
	});
});
