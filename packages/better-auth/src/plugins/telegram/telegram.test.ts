import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { telegram } from "./index";
import { telegramClient } from "./client";

describe("telegram", async (it) => {
	it("should reject verification if auth_date is expired", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [
					telegram({
						botToken: "A1b2C3d4E5f6G7h8J",
					}),
				],
			},
			{
				clientOptions: {
					plugins: [telegramClient()],
				},
			},
		);
		const { error } = await client.telegram.signIn({
			id: 1111111111,
			auth_date: 1754126181,
			hash: "A1b2C3d4E5f6G7h8J",
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("EXPIRED_AUTH_DATE");
		expect(error?.message).toMatch(/expired/i);
	});
});
