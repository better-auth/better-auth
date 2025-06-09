import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { haveIBeenPwned } from "./index";

describe("have-i-been-pwned", async () => {
	const { client, auth } = await getTestInstance(
		{
			plugins: [haveIBeenPwned()],
		},
		{
			disableTestUser: true,
		},
	);
	const ctx = await auth.$context;

	it("should prevent account creation with compromised password", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const compromisedPassword = "123456789";

		const result = await client.signUp.email({
			email: uniqueEmail,
			password: compromisedPassword,
			name: "Test User",
		});
		const user = await ctx.internalAdapter.findUserByEmail(uniqueEmail);
		expect(user).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error?.status).toBe(400);
		expect(result.error?.code).toBe("PASSWORD_COMPROMISED");
	});

	it("should allow account creation with strong, uncompromised password", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const strongPassword = `Str0ng!P@ssw0rd-${Date.now()}`;

		const result = await client.signUp.email({
			email: uniqueEmail,
			password: strongPassword,
			name: "Test User",
		});
		expect(result.data?.user).toBeDefined();
	});

	it("should prevent password update to compromised password", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const initialPassword = `Str0ng!P@ssw0rd-${Date.now()}`;

		const res = await client.signUp.email({
			email: uniqueEmail,
			password: initialPassword,
			name: "Test User",
		});
		const result = await client.changePassword(
			{
				currentPassword: initialPassword,
				newPassword: "123456789",
			},
			{
				headers: {
					authorization: `Bearer ${res.data?.token}`,
				},
			},
		);
		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(400);
	});

	// Test cases for disabledPaths functionality
	describe("disabledPaths functionality", async () => {
		const { client: clientWithDisabledPaths, auth: authWithDisabledPaths } = await getTestInstance(
			{
				plugins: [haveIBeenPwned({
					disabledPaths: ["/sign-in/email"]
				})],
			},
			{
				disableTestUser: true,
			},
		);

		it("should skip password compromise check for disabled paths", async () => {
			const uniqueEmail = `test-${Date.now()}@example.com`;
			const strongPassword = `Str0ng!P@ssw0rd-${Date.now()}`;
			const compromisedPassword = "123456789";

			// First create a user with a strong password
			await clientWithDisabledPaths.signUp.email({
				email: uniqueEmail,
				password: strongPassword,
				name: "Test User",
			});

			// Try to sign in with compromised password (should work because sign-in is disabled)
			const result = await clientWithDisabledPaths.signIn.email({
				email: uniqueEmail,
				password: compromisedPassword,
			});

			// The request should not be blocked by password compromise check
			// (though it will fail for wrong password, that's expected)
			expect(result.error?.code).not.toBe("PASSWORD_COMPROMISED");
		});

		it("should still check password compromise for non-disabled paths", async () => {
			const uniqueEmail = `test-${Date.now()}@example.com`;
			const compromisedPassword = "123456789";

			// Try to sign up with compromised password (should be blocked)
			const result = await clientWithDisabledPaths.signUp.email({
				email: uniqueEmail,
				password: compromisedPassword,
				name: "Test User",
			});

			expect(result.error).not.toBeNull();
			expect(result.error?.status).toBe(400);
			expect(result.error?.code).toBe("PASSWORD_COMPROMISED");
		});

		it("should work normally when disabledPaths is empty array", async () => {
			const { client: clientWithEmptyDisabled } = await getTestInstance(
				{
					plugins: [haveIBeenPwned({
						disabledPaths: []
					})],
				},
				{
					disableTestUser: true,
				},
			);

			const uniqueEmail = `test-${Date.now()}@example.com`;
			const compromisedPassword = "123456789";

			const result = await clientWithEmptyDisabled.signUp.email({
				email: uniqueEmail,
				password: compromisedPassword,
				name: "Test User",
			});

			expect(result.error?.code).toBe("PASSWORD_COMPROMISED");
		});

		it("should work normally when disabledPaths is undefined", async () => {
			const { client: clientWithUndefinedDisabled } = await getTestInstance(
				{
					plugins: [haveIBeenPwned({
						disabledPaths: undefined
					})],
				},
				{
					disableTestUser: true,
				},
			);

			const uniqueEmail = `test-${Date.now()}@example.com`;
			const compromisedPassword = "123456789";

			const result = await clientWithUndefinedDisabled.signUp.email({
				email: uniqueEmail,
				password: compromisedPassword,
				name: "Test User",
			});

			expect(result.error?.code).toBe("PASSWORD_COMPROMISED");
		});
	});
});
