import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { turnstile } from ".";

describe("turnstile", async (it) => {
	const { client } = await getTestInstance({
		plugins: [turnstile({ secretKey: "xx-secret-key" })],
	});

	it("Should return 400 if no captcha token is found in the request headers", async () => {
		const res = await client.signUp.email({
			email: "new-email@gamil.com",
			password: "new-password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(400);
	});
});
