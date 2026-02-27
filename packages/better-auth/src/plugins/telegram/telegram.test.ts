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
		const { error } = await client.signIn.telegram({
			id: 1111111111,
			first_name: "hi",
			auth_date: 1754126181,
			hash: "A1b2C3d4E5f6G7h8J",
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("EXPIRED_AUTH_DATE");
		expect(error?.message).toMatch(/expired/i);
	});

	it("should reject verification if hash is incorrect", async () => {
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
		const currentTime = Math.floor(Date.now() / 1000);
		const { error } = await client.signIn.telegram({
			id: 1111111111,
			first_name: "hi",
			auth_date: currentTime,
			hash: "A1b2C3d4E5f6G7h8J",
		});

		expect(error).toBeDefined();
		expect(error?.status).toBe(401);
		expect(error?.code).toBe("INVALID_DATA_OR_HASH");
		expect(error?.message).toMatch(/expired/i);
	});
});
