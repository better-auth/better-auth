import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("sign-up with custom fields", async (it) => {
	const mockFn = vi.fn();
	const { auth, db } = await getTestInstance(
		{
			account: {
				fields: {
					providerId: "provider_id",
					accountId: "account_id",
				},
			},
			user: {
				additionalFields: {
					newField: {
						type: "string",
						required: false,
					},
					newField2: {
						type: "string",
						required: false,
					},
				},
			},
			emailVerification: {
				sendOnSignUp: true,
				sendVerificationEmail: async ({ user, url, token }, request) => {
					mockFn(user, url);
				},
			},
		},
		{
			disableTestUser: true,
		},
	);
	it("should work with custom fields on account table", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "email@test.com",
				password: "password",
				name: "Test Name",
			},
		});
		expect(res.token).toBeDefined();
		const accounts = await db.findMany({
			model: "account",
		});
		expect(accounts).toHaveLength(1);
	});

	it("should send verification email", async () => {
		expect(mockFn).toHaveBeenCalledWith(expect.any(Object), expect.any(String));
	});
});
