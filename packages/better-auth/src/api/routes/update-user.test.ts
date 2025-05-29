import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createHeadersWithTenantId } from "../../test-utils/headers";

describe("updateUser", async () => {
	const sendChangeEmail = vi.fn();
	let emailVerificationToken = "";
	const { client, testUser, sessionSetter, db, customFetchImpl } =
		await getTestInstance({
			emailVerification: {
				async sendVerificationEmail({ user, url, token }) {
					emailVerificationToken = token;
				},
			},
			user: {
				changeEmail: {
					enabled: true,
					sendChangeEmailVerification: async ({
						user,
						newEmail,
						url,
						token,
					}) => {
						sendChangeEmail(user, newEmail, url, token);
					},
				},
			},
		});
	const headers = new Headers();
	const session = await client.signIn.email({
		email: testUser.email,
		password: testUser.password,
		fetchOptions: {
			onSuccess: sessionSetter(headers),
			onRequest(context) {
				return context;
			},
		},
	});
	if (!session) {
		throw new Error("No session");
	}

	it("should update the user's name", async () => {
		const updated = await client.updateUser({
			name: "newName",
			image: "https://example.com/image.jpg",
			fetchOptions: {
				headers,
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(updated.data?.status).toBe(true);
		expect(session.user.name).toBe("newName");
	});

	it("should unset image", async () => {
		const updated = await client.updateUser({
			image: null,
			fetchOptions: {
				headers,
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(session.user.image).toBeNull();
	});

	it("should update user email", async () => {
		const newEmail = "new-email@email.com";
		const res = await client.changeEmail({
			newEmail,
			fetchOptions: {
				headers: headers,
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(session.user.email).toBe(newEmail);
		expect(session.user.emailVerified).toBe(false);
	});

	it("should verify email", async () => {
		await client.verifyEmail({
			query: {
				token: emailVerificationToken,
			},
			fetchOptions: {
				headers,
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(session.user.emailVerified).toBe(true);
	});

	it("should send email verification before update", async () => {
		await db.update({
			model: "user",
			update: {
				emailVerified: true,
			},
			where: [
				{
					field: "email",
					value: "new-email@email.com",
				},
			],
		});
		await client.changeEmail({
			newEmail: "new-email-2@email.com",
			fetchOptions: {
				headers: headers,
			},
		});
		expect(sendChangeEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "new-email@email.com",
			}),
			"new-email-2@email.com",
			expect.any(String),
			expect.any(String),
		);
	});

	it("should update the user's password", async () => {
		const newEmail = "new-email@email.com";
		const updated = await client.changePassword({
			newPassword: "newPassword",
			currentPassword: testUser.password,
			revokeOtherSessions: true,
			fetchOptions: {
				headers: headers,
			},
		});
		expect(updated).toBeDefined();
		const signInRes = await client.signIn.email({
			email: newEmail,
			password: "newPassword",
		});
		expect(signInRes.data?.user).toBeDefined();
		const signInCurrentPassword = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(signInCurrentPassword.data).toBeNull();
	});

	it("should not update password if current password is wrong", async () => {
		const newHeaders = new Headers();
		await client.signUp.email({
			name: "name",
			email: "new-email-2@email.com",
			password: "password",
			fetchOptions: {
				onSuccess: sessionSetter(newHeaders),
			},
		});
		const res = await client.changePassword({
			newPassword: "newPassword",
			currentPassword: "wrongPassword",
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(res.data).toBeNull();
		const signInAttempt = await client.signIn.email({
			email: "new-email-2@email.com",
			password: "newPassword",
		});
		expect(signInAttempt.data).toBeNull();
	});

	it("should revoke other sessions", async () => {
		const newHeaders = new Headers();
		await client.changePassword({
			newPassword: "newPassword",
			currentPassword: testUser.password,
			revokeOtherSessions: true,
			fetchOptions: {
				headers: headers,
				onSuccess: sessionSetter(newHeaders),
			},
		});
		const cookie = newHeaders.get("cookie");
		const oldCookie = headers.get("cookie");
		expect(cookie).not.toBe(oldCookie);
		const sessionAttempt = await client.getSession({
			fetchOptions: {
				headers: headers,
			},
		});
		expect(sessionAttempt.data).toBeNull();
	});

	it("shouldn't pass defaults", async () => {
		const { client, sessionSetter, db } = await getTestInstance(
			{
				user: {
					additionalFields: {
						newField: {
							type: "string",
							defaultValue: "default",
						},
					},
				},
			},
			{
				disableTestUser: true,
			},
		);
		const headers = new Headers();
		await client.signUp.email({
			email: "new-email@emial.com",
			name: "name",
			password: "password",
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});

		const res = await db.update<{ newField: string }>({
			model: "user",
			update: {
				newField: "new",
			},
			where: [
				{
					field: "email",
					value: "new-email@emial.com",
				},
			],
		});
		expect(res?.newField).toBe("new");

		const updated = await client.updateUser({
			name: "newName",
			fetchOptions: {
				headers,
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		// @ts-ignore
		expect(session?.user.newField).toBe("new");
	});
});

describe("updateUser multi-tenancy", async () => {
	const sendChangeEmail = vi.fn();
	let emailVerificationToken = "";
	
	const { client, auth } = await getTestInstance(
		{
			multiTenancy: {
				enabled: true,
			},
			emailVerification: {
				async sendVerificationEmail({ user, url, token }) {
					emailVerificationToken = token;
				},
			},
			user: {
				changeEmail: {
					enabled: true,
					sendChangeEmailVerification: async ({
						user,
						newEmail,
						url,
						token,
					}) => {
						sendChangeEmail(user, newEmail, url, token);
					},
				},
			},
		},
		{
			disableTestUser: true,
		}
	);

	it("should isolate user updates per tenant", async () => {
		// Create users in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "user1@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "user2@test.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Update tenant-1 user
		const tenant1Update = await client.updateUser({
			name: "Updated User 1",
			image: "https://example.com/image1.jpg",
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		expect(tenant1Update.data?.status).toBe(true);

		// Verify tenant-1 user was updated
		const tenant1Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		// Verify tenant-2 user was not affected
		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});

		expect(tenant1Session.data?.user.name).toBe("Updated User 1");
		expect(tenant1Session.data?.user.image).toBe("https://example.com/image1.jpg");
		expect(tenant2Session.data?.user.name).toBe("User 2");
		expect(tenant2Session.data?.user.image).toBeNull();
	});

	it("should handle email changes per tenant", async () => {
		// Create users in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "change1@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "change2@test.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Change email for tenant-1 user
		const emailChangeResult = await client.changeEmail({
			newEmail: "newemail1@test.com",
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		expect(emailChangeResult.data?.status).toBe(true);

		// Verify tenant-1 user email was changed
		const tenant1Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		// Verify tenant-2 user email was not affected
		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});

		expect(tenant1Session.data?.user.email).toBe("newemail1@test.com");
		expect(tenant1Session.data?.user.emailVerified).toBe(false);
		expect(tenant2Session.data?.user.email).toBe("change2@test.com");
	});

	it.skip("should handle password changes per tenant", async () => {
		// TODO: Fix password change functionality in multi-tenant context
		// The password change API might need additional handling for multi-tenancy
	});

	it("should revoke sessions only within tenant", async () => {
		// Create users in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "revoke1@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "revoke2@test.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Change password for tenant-1 user with session revocation
		await client.changePassword({
			newPassword: "newpassword",
			currentPassword: "password",
			revokeOtherSessions: true,
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		// Verify tenant-1 user's old session is revoked
		const tenant1Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});
		expect(tenant1Session.data).toBeNull();

		// Verify tenant-2 user's session is still active
		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});
		expect(tenant2Session.data?.user.id).toBe(tenant2User.user.id);
	});
});

describe("delete user multi-tenancy", async () => {
	it("should delete users only within correct tenant", async () => {
		const { client, auth } = await getTestInstance(
			{
				multiTenancy: {
					enabled: true,
				},
				user: {
					deleteUser: {
						enabled: true,
					},
				},
				session: {
					freshAge: 1000,
				},
			},
			{
				disableTestUser: true,
			}
		);

		// Create users in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "delete1@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "delete2@test.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Delete tenant-1 user
		const deleteResult = await client.deleteUser({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		expect(deleteResult.data).toMatchObject({
			success: true,
		});

		// Verify tenant-1 user is deleted
		const tenant1Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});
		expect(tenant1Session.data).toBeNull();

		// Verify tenant-2 user is still active
		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});
		expect(tenant2Session.data?.user.id).toBe(tenant2User.user.id);
	});

	it("should handle delete verification flow per tenant", async () => {
		const tokenStore = new Map<string, string>();
		
		const { client, auth } = await getTestInstance(
			{
				multiTenancy: {
					enabled: true,
				},
				user: {
					deleteUser: {
						enabled: true,
						async sendDeleteAccountVerification(data, _) {
							tokenStore.set(data.user.id, data.token);
						},
					},
				},
			},
			{
				disableTestUser: true,
			}
		);

		// Create users in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "deleteverify1@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "deleteverify2@test.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Start delete process for tenant-1 user
		const deleteInitResult = await client.deleteUser({
			password: "password",
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		expect(deleteInitResult.data).toMatchObject({
			success: true,
		});

		const deleteToken = tokenStore.get(tenant1User.user.id);
		expect(deleteToken).toBeDefined();

		// Verify tenant-1 user is not deleted yet
		const tenant1SessionBeforeConfirm = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});
		expect(tenant1SessionBeforeConfirm.data?.user.id).toBe(tenant1User.user.id);

		// Complete delete process for tenant-1 user
		const deleteConfirmResult = await client.deleteUser({
			token: deleteToken,
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		expect(deleteConfirmResult.data).toMatchObject({
			success: true,
		});

		// Verify tenant-1 user is now deleted
		const tenant1SessionAfterConfirm = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});
		expect(tenant1SessionAfterConfirm.data).toBeNull();

		// Verify tenant-2 user is still active
		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});
		expect(tenant2Session.data?.user.id).toBe(tenant2User.user.id);
	});
});

describe("delete user", async () => {
	it("should delete the user with a fresh session", async () => {
		const { auth, client, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
			session: {
				freshAge: 1000,
			},
		});
		const { headers } = await signInWithTestUser();
		const res = await client.deleteUser({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toMatchObject({
			success: true,
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data).toBeNull();
	});

	it("should delete with verification flow and password", async () => {
		let token = "";
		const { client, signInWithTestUser, testUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
					async sendDeleteAccountVerification(data, _) {
						token = data.token;
					},
				},
			},
		});
		const { headers } = await signInWithTestUser();
		const res = await client.deleteUser({
			password: testUser.password,
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toMatchObject({
			success: true,
		});
		expect(token.length).toBe(32);
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data).toBeDefined();
		const deleteCallbackRes = await client.deleteUser({
			token,
			fetchOptions: {
				headers,
			},
		});
		expect(deleteCallbackRes.data).toMatchObject({
			success: true,
		});
		const nullSession = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(nullSession.data).toBeNull();
	});
});
