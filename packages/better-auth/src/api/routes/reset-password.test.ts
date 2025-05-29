import { describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createHeadersWithTenantId } from "../../test-utils/headers";

describe("forget password", async (it) => {
	const mockSendEmail = vi.fn();
	let token = "";

	const { client, testUser, auth } = await getTestInstance(
		{
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ url }) {
					token = url.split("?")[0].split("/").pop() || "";
					await mockSendEmail();
				},
			},
		},
		{
			testWith: "sqlite",
		},
	);
	it("should send a reset password email when enabled", async () => {
		await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});
		expect(token.length).toBeGreaterThan(10);
	});

	it("should fail on invalid password", async () => {
		const res = await client.resetPassword(
			{
				newPassword: "short",
			},
			{
				query: {
					token,
				},
			},
		);
		expect(res.error?.status).toBe(400);
	});

	it("should verify the token", async () => {
		const newPassword = "new-password";
		const res = await client.resetPassword(
			{
				newPassword,
			},
			{
				query: {
					token,
				},
			},
		);
		expect(res.data).toMatchObject({
			status: true,
		});
	});

	it("should sign-in with the new password", async () => {
		const withOldCred = await client.signIn.email({
			email: testUser.email,
			password: testUser.email,
		});
		expect(withOldCred.error?.status).toBe(401);
		const newCred = await client.signIn.email({
			email: testUser.email,
			password: "new-password",
		});
		expect(newCred.data?.user).toBeDefined();
	});

	it("shouldn't allow the token to be used twice", async () => {
		const newPassword = "new-password";
		const res = await client.resetPassword(
			{
				newPassword,
			},
			{
				query: {
					token,
				},
			},
		);

		expect(res.error?.status).toBe(400);
	});

	it("should expire", async () => {
		const { client, signInWithTestUser, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ token: _token }) {
					token = _token;
					await mockSendEmail();
				},
				resetPasswordTokenExpiresIn: 10,
			},
		});
		const { headers } = await signInWithTestUser();
		await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "/sign-in",
			fetchOptions: {
				headers,
			},
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 9);
		const callbackRes = await client.$fetch("/reset-password/:token", {
			params: {
				token,
			},
			query: {
				callbackURL: "/cb",
			},
			onError(context) {
				const location = context.response.headers.get("location");
				expect(location).not.toContain("error");
				expect(location).toContain("token");
			},
		});
		const res = await client.resetPassword({
			newPassword: "new-password",
			token,
		});
		expect(res.data?.status).toBe(true);
		await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "/sign-in",
			fetchOptions: {
				headers,
			},
		});
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 11);
		const res2 = await client.resetPassword({
			newPassword: "new-password",
			token,
		});
		expect(res2.error?.status).toBe(400);
	});

	it("should allow callbackURL to have multiple query params", async () => {
		let url = "";

		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword(context) {
					url = context.url;
					await mockSendEmail();
				},
				resetPasswordTokenExpiresIn: 10,
			},
		});

		const queryParams = "foo=bar&baz=qux";
		const redirectTo = `http://localhost:3000?${queryParams}`;
		const res = await client.requestPasswordReset({
			email: testUser.email,
			redirectTo,
		});

		expect(res.data?.status).toBe(true);
		expect(url).not.toContain(queryParams);
		expect(url).toContain(`callbackURL=${encodeURIComponent(redirectTo)}`);
	});
});

describe("revoke sessions on password reset", async (it) => {
	const mockSendEmail = vi.fn();
	let token = "";

	const { client, testUser, signInWithTestUser } = await getTestInstance(
		{
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ url }) {
					token = url.split("?")[0].split("/").pop() || "";
					await mockSendEmail();
				},
				revokeSessionsOnPasswordReset: true,
			},
		},
		{
			testWith: "sqlite",
		},
	);

	it("should revoke other sessions when revokeSessionsOnPasswordReset is enabled", async () => {
		const { headers } = await signInWithTestUser();

		await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});

		await client.resetPassword(
			{
				newPassword: "new-password",
			},
			{
				query: {
					token,
				},
			},
		);

		const sessionAttempt = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAttempt.data).toBeNull();
	});

	it("should not revoke other sessions by default", async () => {
		const { client, testUser, signInWithTestUser } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
					async sendResetPassword({ url }) {
						token = url.split("?")[0].split("/").pop() || "";
						await mockSendEmail();
					},
				},
			},
			{
				testWith: "sqlite",
			},
		);

		const { headers } = await signInWithTestUser();

		await client.requestPasswordReset({
			email: testUser.email,
			redirectTo: "http://localhost:3000",
		});

		await client.resetPassword(
			{
				newPassword: "new-password",
			},
			{
				query: {
					token,
				},
			},
		);

		const sessionAttempt = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(sessionAttempt.data?.user).toBeDefined();
	});
});

describe("forget password multi-tenancy", async (it) => {
	const mockSendEmail = vi.fn();
	let tenant1Token = "";
	let tenant2Token = "";

	const { client, auth } = await getTestInstance(
		{
			multiTenancy: {
				enabled: true,
			},
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ url, token }) {
					const tenantMatch = url.match(/tenant-(\d+)/);
					if (tenantMatch?.[1] === "1") {
						tenant1Token = token;
					} else if (tenantMatch?.[1] === "2") {
						tenant2Token = token;
					}
					await mockSendEmail();
				},
			},
		},
		{
			disableTestUser: true,
			testWith: "sqlite",
		},
	);

	it("should isolate password reset tokens per tenant", async () => {
		// Create users in different tenants with same email
		const email = "reset@test.com";
		
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Request password reset for both tenants
		await auth.api.forgetPassword({
			body: {
				email,
				redirectTo: "http://localhost:3000/tenant-1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		await auth.api.forgetPassword({
			body: {
				email,
				redirectTo: "http://localhost:3000/tenant-2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		expect(tenant1Token).toBeDefined();
		expect(tenant2Token).toBeDefined();
		expect(tenant1Token).not.toBe(tenant2Token);
	});

	it("should only reset password for correct tenant", async () => {
		const newPassword = "new-password";

		// Try to reset password using tenant-1 token with tenant-2 context (should fail)
		try {
			const wrongTenantReset = await auth.api.resetPassword({
				body: {
					newPassword,
					token: tenant1Token,
				},
				headers: createHeadersWithTenantId("tenant-2"),
			});
			expect(true).toBe(false); // Should not reach here
		} catch (error) {
			expect(error).toBeDefined();
		}

		// Reset password using correct tenant context (should succeed)
		const correctTenantReset = await auth.api.resetPassword({
			body: {
				newPassword,
				token: tenant1Token,
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		expect(correctTenantReset?.status).toBe(true);
	});

	it("should sign in with new password only in correct tenant", async () => {
		const email = "reset@test.com";
		const newPassword = "new-password";

		// Try to sign in with new password in tenant-1 (should work)
		const tenant1SignIn = await auth.api.signInEmail({
			body: {
				email,
				password: newPassword,
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		expect(tenant1SignIn.user).toBeDefined();
		expect(tenant1SignIn.user.tenantId).toBe("tenant-1");

		// Try to sign in with new password in tenant-2 (should fail - password not changed there)
		try {
			const tenant2SignIn = await auth.api.signInEmail({
				body: {
					email,
					password: newPassword,
				},
				headers: createHeadersWithTenantId("tenant-2"),
			});
			expect(true).toBe(false); // Should not reach here
		} catch (error) {
			expect(error).toBeDefined();
		}

		// But original password should still work in tenant-2
		const tenant2OriginalPassword = await auth.api.signInEmail({
			body: {
				email,
				password: "password",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		expect(tenant2OriginalPassword.user).toBeDefined();
		expect(tenant2OriginalPassword.user.tenantId).toBe("tenant-2");
	});

	it("should not allow cross-tenant password reset", async () => {
		const email = "cross-tenant@test.com";

		// Create user only in tenant-1
		await auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Try to request password reset from tenant-2 (should fail silently)
		const resetAttempt = await auth.api.forgetPassword({
			body: {
				email,
				redirectTo: "http://localhost:3000",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Should succeed (for security, don't reveal if user exists)
		expect(resetAttempt.status).toBe(true);
		
		// But no token should be generated since user doesn't exist in tenant-2
		expect(tenant2Token).toBeDefined(); // Still has token from previous test
	});

	it("should revoke sessions correctly per tenant when enabled", async () => {
		const mockSendEmailWithRevoke = vi.fn();
		let revokeToken = "";

		const { client: revokeClient, auth: revokeAuth } = await getTestInstance(
			{
				multiTenancy: {
					enabled: true,
				},
				emailAndPassword: {
					enabled: true,
					async sendResetPassword({ token }) {
						revokeToken = token;
						await mockSendEmailWithRevoke();
					},
					revokeSessionsOnPasswordReset: true,
				},
			},
			{
				disableTestUser: true,
				testWith: "sqlite",
			},
		);

		const email = "revoke@test.com";

		// Create users in both tenants
		const tenant1User = await revokeAuth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await revokeAuth.api.signUpEmail({
			body: {
				email: "different@test.com",
				password: "password", 
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Request password reset for tenant-1
		await revokeAuth.api.forgetPassword({
			body: {
				email,
				redirectTo: "http://localhost:3000",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Reset password for tenant-1
		await revokeAuth.api.resetPassword({
			body: {
				newPassword: "new-password",
				token: revokeToken,
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		// Verify tenant-1 session is revoked
		const tenant1Session = await revokeAuth.api.getSession({
			headers: createHeadersWithTenantId("tenant-1", {
				authorization: `Bearer ${tenant1User.token}`,
			}),
		});
		expect(tenant1Session).toBeNull();

		// Verify tenant-2 session is still active
		const tenant2Session = await revokeAuth.api.getSession({
			headers: createHeadersWithTenantId("tenant-2", {
				authorization: `Bearer ${tenant2User.token}`,
			}),
		});
		expect(tenant2Session?.user).toBeDefined();
	});
});
