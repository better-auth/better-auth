import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { passwordPlugin } from "./index";

describe("password-strength plugin", async () => {
	const { client, auth } = await getTestInstance(
		{
			plugins: [passwordPlugin()],
		},
		{
			disableTestUser: true,
		},
	);

	const ctx = await auth.$context;

	it("should prevent account creation with weak password", async () => {
		const email = `weak-${Date.now()}@example.com`;
		const weakPassword = "abc"; // too short, lacks requirements

		const result = await client.signUp.email({
			email,
			password: weakPassword,
			name: "Weak User",
		});

		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(400);
		expect(result.error?.message).toMatch(/Password validation failed/i);

		const user = await ctx.internalAdapter.findUserByEmail(email);
		expect(user).toBeNull();
	});

	it("should allow account creation with strong password", async () => {
		const email = `strong-${Date.now()}@example.com`;
		const strongPassword = `Str0ng!P@ss-${Date.now()}`;

		const result = await client.signUp.email({
			email,
			password: strongPassword,
			name: "Strong User",
		});

		expect(result.data?.user).toBeDefined();
	});

	it("should prevent updating to weak password", async () => {
		const email = `update-${Date.now()}@example.com`;
		const initialPassword = `Str0ng!P@ss-${Date.now()}`;
		const weakPassword = "aaa";

		const signUpRes = await client.signUp.email({
			email,
			password: initialPassword,
			name: "Updater",
		});

		const token = signUpRes.data?.token;

		const result = await client.changePassword(
			{
				currentPassword: initialPassword,
				newPassword: weakPassword,
			},
			{
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		);

		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(400);
		expect(result.error?.message).toMatch(/Password validation failed/i);
	});
});
