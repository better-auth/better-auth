import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../utils/cookies";

const { auth, client, createTestUser } = await getTestInstance();

describe("session", async () => {
	it("should set cookies correctly", async () => {
		const testUser = await createTestUser();
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			options: {
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					expect(cookies.get("better-auth.session_token")).toMatchObject({
						value: expect.any(String),
						"max-age": (60 * 60 * 24 * 7).toString(),
						path: "/",
						httponly: true,
						samesite: "Lax",
					});
				},
			},
		});
	});
});
