import { describe, expect } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

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
