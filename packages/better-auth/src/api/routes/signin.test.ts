import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("signIn", async () => {
	const app = await getTestInstance();
	it("should sign up with credential", async () => {
		const res = await app.api.signUpCredential({
			body: {
				email: "test@test.com",
				password: "test1234",
				name: "test",
			},
		});
		expect(res).toMatchObject({
			user: {
				id: expect.any(String),
				email: "test@test.com",
				name: "test",
				image: undefined,
				emailVerified: false,
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			},
			session: {
				id: expect.any(String),
				userId: expect.any(String),
				expiresAt: expect.any(Date),
			},
		});
	});

	it("should sign in with credential", async () => {
		const res = await app.api.signInCredential({
			body: {
				email: "test@test.com",
				password: "test1234",
			},
		});
		expect(res).toMatchObject({
			user: {
				id: expect.any(String),
				email: "test@test.com",
				name: "test",
				image: null,
				emailVerified: false,
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			},
			session: {
				id: expect.any(String),
				userId: expect.any(String),
				expiresAt: expect.any(Date),
			},
		});
	});
});
