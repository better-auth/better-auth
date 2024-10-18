import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("sign-up with custom fields", async (it) => {
	it("should work with custom fields on account table", async () => {
		const { auth, db } = await getTestInstance(
			{
				account: {
					fields: {
						providerId: "provider_id",
						accountId: "account_id",
					},
				},
			},
			{
				disableTestUser: true,
			},
		);
		const res = await auth.api.signUpEmail({
			body: {
				email: "email@test.com",
				password: "password",
				name: "name",
			},
		});
		expect(res.user).toBeDefined();
		const accounts = await db.findMany({
			model: "account",
		});
		expect(accounts).toHaveLength(1);
	});
});
