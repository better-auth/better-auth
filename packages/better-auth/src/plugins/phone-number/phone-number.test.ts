import { describe, expect } from "vitest";
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
		await client.phoneNumber.verify({
			phoneNumber: "+251911121314",
			code: otp,
		});
		const user = await client.session({
			fetchOptions: {
				headers,
			},
		});
		expect(user.data?.user.phoneNumberVerified).toBe(true);
	});
});
