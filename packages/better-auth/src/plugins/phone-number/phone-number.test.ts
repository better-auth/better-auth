import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { phoneNumber } from ".";
import { createAuthClient } from "../../client";
import { phoneNumberClient } from "./client";

describe("phone-number", async (it) => {
	const { customFetchImpl } = await getTestInstance({
		plugins: [phoneNumber()],
	});

	it("should sign-up with phone number", async () => {
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [phoneNumberClient()],
			fetchOptions: {
				customFetchImpl,
			},
		});

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
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [phoneNumberClient()],
			fetchOptions: {
				customFetchImpl,
			},
		});

		const res = await client.signIn.phoneNumber({
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
});
