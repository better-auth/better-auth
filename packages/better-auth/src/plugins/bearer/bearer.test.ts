import { describe, expect, it } from "vitest";
import { bearer } from ".";
import { getTestInstance } from "../../test-utils/test-instance";

describe("bearer", async () => {
	const { client, testUser } = await getTestInstance({
		plugins: [bearer()],
	});
	it("should get session", async () => {
		const res = await client.$fetch<{ session: { id: string } }>(
			"/sign-in/credential",
			{
				method: "POST",
				body: {
					email: "test@test.com",
					password: "test123456",
				},
			},
		);
		const session = await client.session({
			options: {
				headers: {
					authorization: `Bearer ${res.data?.session.id}`,
				},
			},
		});
		expect(session.data?.session.id).toBe(res.data?.session.id);
	});
});
