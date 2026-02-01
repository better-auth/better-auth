import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { passwordHistory } from "./index";

describe("password-history", async () => {
	const { client } = await getTestInstance(
		{
			plugins: [passwordHistory({ historyCount: 3 })],
			emailAndPassword: {
				enabled: true,
				sendResetPassword: async ({ user, url }) => {
					// Mock email sending for tests
					return;
				},
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should allow first password change without history", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const initialPassword = `InitialP@ssw0rd-${Date.now()}`;
		const newPassword = `NewP@ssw0rd-${Date.now()}`;

		// Sign up
		const signUpResult = await client.signUp.email({
			email: uniqueEmail,
			password: initialPassword,
			name: "Test User",
		});
		expect(signUpResult.data?.user).toBeDefined();

		// Change password for the first time
		const changeResult = await client.changePassword(
			{
				currentPassword: initialPassword,
				newPassword: newPassword,
			},
			{
				headers: {
					authorization: `Bearer ${signUpResult.data?.token}`,
				},
			},
		);
		expect(changeResult.data).toBeDefined();
		expect(changeResult.error).toBeNull();
	});

	it("should prevent reusing the current password", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const password = `P@ssw0rd-${Date.now()}`;

		// Sign up
		const signUpResult = await client.signUp.email({
			email: uniqueEmail,
			password: password,
			name: "Test User",
		});
		expect(signUpResult.data?.user).toBeDefined();

		// Try to change to the same password
		const changeResult = await client.changePassword(
			{
				currentPassword: password,
				newPassword: password,
			},
			{
				headers: {
					authorization: `Bearer ${signUpResult.data?.token}`,
				},
			},
		);

		expect(changeResult.error).toBeDefined();
		expect(changeResult.error?.status).toBe(400);
		expect(changeResult.error?.code).toBe("PASSWORD_REUSED");
	});

	it("should prevent reusing a previous password within history", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const password1 = `P@ssw0rd1-${Date.now()}`;
		const password2 = `P@ssw0rd2-${Date.now()}`;
		const password3 = `P@ssw0rd3-${Date.now()}`;

		// Sign up with password1
		const signUpResult = await client.signUp.email({
			email: uniqueEmail,
			password: password1,
			name: "Test User",
		});
		let token = signUpResult.data?.token;
		expect(signUpResult.data?.user).toBeDefined();

		// Change to password2
		const change1 = await client.changePassword(
			{
				currentPassword: password1,
				newPassword: password2,
			},
			{
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		);
		expect(change1.data).toBeDefined();
		token = change1.data?.token || token;

		// Change to password3
		const change2 = await client.changePassword(
			{
				currentPassword: password2,
				newPassword: password3,
			},
			{
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		);
		expect(change2.data).toBeDefined();
		token = change2.data?.token || token;

		// Try to change back to password1 (should fail - within history)
		const change3 = await client.changePassword(
			{
				currentPassword: password3,
				newPassword: password1,
			},
			{
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		);

		expect(change3.error).toBeDefined();
		expect(change3.error?.status).toBe(400);
		expect(change3.error?.code).toBe("PASSWORD_REUSED");
	});

	it(
		"should allow reusing a password after it falls out of history",
		{ timeout: 15000 }, // 15 second timeout for multiple sequential operations
		async () => {
			const uniqueEmail = `test-${Date.now()}@example.com`;
			const password1 = `P@ssw0rd1-${Date.now()}`;
			const password2 = `P@ssw0rd2-${Date.now()}`;
			const password3 = `P@ssw0rd3-${Date.now()}`;
			const password4 = `P@ssw0rd4-${Date.now()}`;

			// Sign up with password1
			const signUpResult = await client.signUp.email({
				email: uniqueEmail,
				password: password1,
				name: "Test User",
			});
			let token = signUpResult.data?.token;
			expect(signUpResult.data?.user).toBeDefined();

			// Change to password2
			const change1 = await client.changePassword(
				{
					currentPassword: password1,
					newPassword: password2,
				},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				},
			);
			expect(change1.data).toBeDefined();
			token = change1.data?.token || token;

			// Change to password3
			const change2 = await client.changePassword(
				{
					currentPassword: password2,
					newPassword: password3,
				},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				},
			);
			expect(change2.data).toBeDefined();
			token = change2.data?.token || token;

			// Change to password4 (password1 should now be out of history with historyCount=3)
			const change3 = await client.changePassword(
				{
					currentPassword: password3,
					newPassword: password4,
				},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				},
			);
			expect(change3.data).toBeDefined();
			token = change3.data?.token || token;

			// Now try to change back to password1 (should succeed - out of history)
			const change4 = await client.changePassword(
				{
					currentPassword: password4,
					newPassword: password1,
				},
				{
					headers: {
						authorization: `Bearer ${token}`,
					},
				},
			);
			expect(change4.data).toBeDefined();
			expect(change4.error).toBeNull();
		},
	);

	it("should work with reset password endpoint", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const initialPassword = `InitialP@ssw0rd-${Date.now()}`;
		let resetToken = "";

		// Create a test instance with token capture
		const { client: resetClient } = await getTestInstance(
			{
				plugins: [passwordHistory({ historyCount: 3 })],
				emailAndPassword: {
					enabled: true,
					sendResetPassword: async ({ url }) => {
						// Extract token from URL
						resetToken = url.split("?")[0]!.split("/").pop() || "";
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		// Sign up
		const signUpResult = await resetClient.signUp.email({
			email: uniqueEmail,
			password: initialPassword,
			name: "Test User",
		});
		expect(signUpResult.data?.user).toBeDefined();

		// Request password reset
		await resetClient.requestPasswordReset({
			email: uniqueEmail,
			redirectTo: "/reset-password",
		});

		expect(resetToken.length).toBeGreaterThan(10);

		// Try to reset to the same password (should fail)
		const resetResult = await resetClient.resetPassword({
			newPassword: initialPassword,
			token: resetToken,
		});

		expect(resetResult.error).toBeDefined();
		expect(resetResult.error?.status).toBe(400);
		expect(resetResult.error?.code).toBe("PASSWORD_REUSED");
	});

	it("should allow new password on reset that is not in history", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const initialPassword = `InitialP@ssw0rd-${Date.now()}`;
		const newPassword = `NewP@ssw0rd-${Date.now()}`;
		let resetToken = "";

		// Create a test instance with token capture
		const { client: resetClient } = await getTestInstance(
			{
				plugins: [passwordHistory({ historyCount: 3 })],
				emailAndPassword: {
					enabled: true,
					sendResetPassword: async ({ url }) => {
						// Extract token from URL
						resetToken = url.split("?")[0]!.split("/").pop() || "";
					},
				},
			},
			{
				disableTestUser: true,
			},
		);

		// Sign up
		const signUpResult = await resetClient.signUp.email({
			email: uniqueEmail,
			password: initialPassword,
			name: "Test User",
		});
		expect(signUpResult.data?.user).toBeDefined();

		// Request password reset
		await resetClient.requestPasswordReset({
			email: uniqueEmail,
			redirectTo: "/reset-password",
		});

		expect(resetToken.length).toBeGreaterThan(10);

		// Reset to a new password (should succeed)
		const resetResult = await resetClient.resetPassword({
			newPassword: newPassword,
			token: resetToken,
		});
		expect(resetResult.data).toBeDefined();
		expect(resetResult.error).toBeNull();
	});

	it("should handle users without password history gracefully", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const password = `P@ssw0rd-${Date.now()}`;

		// Sign up
		const signUpResult = await client.signUp.email({
			email: uniqueEmail,
			password: password,
			name: "Test User",
		});
		expect(signUpResult.data?.user).toBeDefined();

		// User should be able to change password even without existing history
		const newPassword = `NewP@ssw0rd-${Date.now()}`;
		const changeResult = await client.changePassword(
			{
				currentPassword: password,
				newPassword: newPassword,
			},
			{
				headers: {
					authorization: `Bearer ${signUpResult.data?.token}`,
				},
			},
		);
		expect(changeResult.data).toBeDefined();
		expect(changeResult.error).toBeNull();
	});
});

describe("password-history with custom options", async () => {
	const customMessage = "You cannot reuse your last 5 passwords!";
	const { client } = await getTestInstance(
		{
			plugins: [
				passwordHistory({
					historyCount: 5,
					customPasswordReusedMessage: customMessage,
				}),
			],
			emailAndPassword: {
				enabled: true,
				sendResetPassword: async ({ user, url }) => {
					return;
				},
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should use custom error message", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const password = `P@ssw0rd-${Date.now()}`;

		// Sign up
		const signUpResult = await client.signUp.email({
			email: uniqueEmail,
			password: password,
			name: "Test User",
		});
		expect(signUpResult.data?.user).toBeDefined();

		// Try to change to the same password
		const changeResult = await client.changePassword(
			{
				currentPassword: password,
				newPassword: password,
			},
			{
				headers: {
					authorization: `Bearer ${signUpResult.data?.token}`,
				},
			},
		);
		expect(changeResult.error).toBeDefined();
		expect(changeResult.error?.status).toBe(400);
		expect(changeResult.error?.code).toBe("PASSWORD_REUSED");
		expect(changeResult.error?.message).toBe(customMessage);
	});
});

describe("password-history with custom paths", async () => {
	const { client } = await getTestInstance(
		{
			plugins: [
				passwordHistory({
					historyCount: 3,
					paths: ["/change-password"], // Only check on change-password
				}),
			],
			emailAndPassword: {
				enabled: true,
				sendResetPassword: async ({ user, url }) => {
					return;
				},
			},
		},
		{
			disableTestUser: true,
		},
	);

	it("should only check history on configured paths", async () => {
		const uniqueEmail = `test-${Date.now()}@example.com`;
		const password = `P@ssw0rd-${Date.now()}`;

		// Sign up (not in paths, so no history check)
		const signUpResult = await client.signUp.email({
			email: uniqueEmail,
			password: password,
			name: "Test User",
		});
		expect(signUpResult.data?.user).toBeDefined();

		// Change password (in paths, so history check applies)
		const changeResult = await client.changePassword(
			{
				currentPassword: password,
				newPassword: password,
			},
			{
				headers: {
					authorization: `Bearer ${signUpResult.data?.token}`,
				},
			},
		);

		expect(changeResult.error).toBeDefined();
		expect(changeResult.error?.status).toBe(400);
		expect(changeResult.error?.code).toBe("PASSWORD_REUSED");
	});
});
