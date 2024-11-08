import { describe, expect, expectTypeOf, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import type { User } from "../../types";

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
				sendVerificationEmail: async (user, url) => {
					mockFn(user, url);
				},
			},
		},
		{
			disableTestUser: true,
		},
	);
	let user: User | null = null;
	it("should work with custom fields on account table", async () => {
		const res = await auth.api.signUpEmail({
			body: {
				email: "email@test.com",
				password: "password",
				name: "Test Name",
			},
		});
		user = res.user;
		expect(res.user).toBeDefined();
		const accounts = await db.findMany({
			model: "account",
		});
		expect(accounts).toHaveLength(1);
	});

	it("should send verification email", async () => {
		expect(mockFn).toHaveBeenCalledWith(user, expect.any(String));
	});

	it("should infer the correct types", async () => {
		const user = await auth.api.signUpEmail({
			body: {
				email: "email2@test.com",
				password: "password",
				name: "name",
				// @ts-expect-error
				newField: 4,
				newField2: "test",
			},
		});
		expectTypeOf(user.user).toMatchTypeOf<{
			id: string;
			email: string;
			emailVerified: boolean;
			name: string;
			image?: string;
			newField?: string;
			createdAt: Date;
			updatedAt: Date;
		}>();
	});
});
