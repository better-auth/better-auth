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
				async sendOTP(_, code) {
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
		expect(res.data?.user.phoneNumberVerified).toBe(true);
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
		console.log(res);
		const user = await client.session({
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
