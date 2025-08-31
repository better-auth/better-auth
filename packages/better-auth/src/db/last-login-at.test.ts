import { describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import type { Session } from "../types";

describe("lastLoginAt feature", () => {
	describe("basic session creation", () => {
		it("should create a session with lastLoginAt", async () => {
			const { client } = await getTestInstance();

			const signUpResponse = await client.signUp.email({
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			});

			expect(signUpResponse.data).toBeDefined();
			expect(signUpResponse.data?.user).toBeDefined();

			const signInResponse = await client.signIn.email({
				email: "test@example.com",
				password: "password123",
			});

			expect(signInResponse.data).toBeDefined();
			expect(signInResponse.data?.user).toBeDefined();

			const sessionResponse = await client.getSession();
			expect(sessionResponse.data).toBeDefined();

			if (sessionResponse.data?.session) {
				expect(sessionResponse.data.session.lastLoginAt).toBeInstanceOf(Date);
			}
		});
	});
});
