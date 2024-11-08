import { describe, expect } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { APIError } from "better-call";

describe("api error", async (it) => {
	const { client } = await getTestInstance();

	it("should have application/json content type on validation error", async () => {
		await client.signIn.email(
			{
				email: "incorrect-email",
				password: "incorrect-password",
			},
			{
				onError(context) {
					expect(context.response.headers.get("content-type")).toBe(
						"application/json",
					);
				},
			},
		);
	});

	it("should have application/json content type on error", async () => {
		await client.signIn.email(
			{
				email: "formatted-email@email.com",
				password: "incorrect-password",
			},
			{
				onError(context) {
					expect(context.response.headers.get("content-type")).toBe(
						"application/json",
					);
				},
			},
		);
	});
});

describe("auth api", async (it) => {
	const { client, auth } = await getTestInstance();

	const testUser = {
		email: "test-email@email.com",
		password: "test-password",
		name: "test-name",
	};

	it("should sign up", async () => {
		const user = await auth.api.signUpEmail({
			body: testUser,
		});
		expect(user).toMatchObject({
			user: {
				id: expect.any(String),
				name: testUser.name,
				email: testUser.email,
				emailVerified: false,
				image: undefined,
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			},
			session: {
				id: expect.any(String),
				expiresAt: expect.any(Date),
				ipAddress: "",
				userAgent: "",
				userId: expect.any(String),
			},
		});
	});
	it("should throw API Error", async () => {
		expect(
			auth.api.signUpEmail({
				body: testUser,
			}),
		).rejects.toThrowError(APIError);
	});
});
