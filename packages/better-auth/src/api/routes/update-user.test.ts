import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { inferAdditionalFields } from "../../client/plugins";
import { getTestInstance } from "../../test-utils/test-instance";
import type { Account, Session } from "../../types";

describe("updateUser", async () => {
	const sendChangeEmail = vi.fn();
	let emailVerificationToken = "";
	const {
		client,
		testUser,
		sessionSetter,
		db,
		customFetchImpl,
		signInWithTestUser,
	} = await getTestInstance({
		emailVerification: {
			async sendVerificationEmail({ user, url, token }) {
				emailVerificationToken = token;
			},
		},
		user: {
			changeEmail: {
				enabled: true,
				sendChangeEmailVerification: async ({ user, newEmail, url, token }) => {
					sendChangeEmail(user, newEmail, url, token);
				},
			},
		},
	});
	// Sign in once for all tests in this describe block
	const { runWithUser: globalRunWithClient } = await signInWithTestUser();

	it("should update the user's name", async () => {
		await globalRunWithClient(async () => {
			const updated = await client.updateUser({
				name: "newName",
				image: "https://example.com/image.jpg",
			});
			const sessionRes = await client.getSession();
			expect(updated.data?.status).toBe(true);
			expect(sessionRes.data?.user.name).toBe("newName");
		});
	});

	it("should unset image", async () => {
		await globalRunWithClient(async () => {
			const updated = await client.updateUser({
				image: null,
			});
			const sessionRes = await client.getSession();
			expect(sessionRes.data?.user.image).toBeNull();
		});
	});

	it("should not update user email immediately (default secure flow)", async () => {
		// Ensure user is verified to trigger the confirmation flow
		await db.update({
			model: "user",
			update: {
				emailVerified: true,
			},
			where: [
				{
					field: "email",
					value: testUser.email,
				},
			],
		});

		const newEmail = "new-email@email.com";
		await globalRunWithClient(async () => {
			const res = await client.changeEmail({
				newEmail,
			});
			const sessionRes = await client.getSession();
			// Should NOT update email yet
			expect(sessionRes.data?.user.email).not.toBe(newEmail);
			expect(sessionRes.data?.user.email).toBe(testUser.email);
		});
	});

	it("should verify email change (flow with confirmation)", async () => {
		// The previous test triggered changeEmail.
		// Since testUser is verified, and sendChangeEmailVerification is provided,
		// it should have sent a confirmation email to the OLD email.

		expect(sendChangeEmail).toHaveBeenCalled();
		const call = sendChangeEmail.mock.calls[0];
		const token = call?.[3]; // token is 4th arg
		if (!token) throw new Error("Token not found");

		await globalRunWithClient(async () => {
			// 1. Verify the confirmation token (sent to old email)
			const res = await client.verifyEmail({
				query: {
					token: token,
				},
			});
			expect(res.data?.status).toBe(true);

			// This should trigger sending verification to the NEW email.
			// emailVerification.sendVerificationEmail should have been called.
			// We captured this in emailVerificationToken variable in setup.
			expect(emailVerificationToken).toBeDefined();

			// User email should STILL be old email
			const sessionRes = await client.getSession();
			expect(sessionRes.data?.user.email).toBe(testUser.email);

			// 2. Verify the new email token
			const res2 = await client.verifyEmail({
				query: {
					token: emailVerificationToken,
				},
			});
			expect(res2.data?.status).toBe(true);

			// NOW user email should be updated
			const sessionRes2 = await client.getSession();
			expect(sessionRes2.data?.user.email).toBe("new-email@email.com");
			expect(sessionRes2.data?.user.emailVerified).toBe(true);
		});
	});

	it("should update the user's password", async () => {
		const newEmail = "new-email@email.com"; // User email is now this
		await globalRunWithClient(async () => {
			const updated = await client.changePassword({
				newPassword: "newPassword",
				currentPassword: testUser.password,
				revokeOtherSessions: true,
			});
			expect(updated).toBeDefined();
		});
		const signInRes = await client.signIn.email({
			email: newEmail,
			password: "newPassword",
		});
		expect(signInRes.data?.user).toBeDefined();
		const signInCurrentPassword = await client.signIn.email({
			email: testUser.email, // Old email
			password: testUser.password,
		});
		expect(signInCurrentPassword.data).toBeNull();
	});

	it("should update account's updatedAt when changing password", async () => {
		const newHeaders = new Headers();
		await client.signUp.email({
			name: "Test User",
			email: "test-updated-at@email.com",
			password: "originalPassword",
			fetchOptions: {
				onSuccess: sessionSetter(newHeaders),
			},
		});

		// Get the initial account data
		const initialSession = await client.getSession({
			fetchOptions: {
				headers: newHeaders,
				throw: true,
			},
		});
		const userId = initialSession?.user.id;

		// Get initial account updatedAt
		const initialAccounts: Account[] = await db.findMany({
			model: "account",
			where: [
				{
					field: "userId",
					value: userId!,
				},
				{
					field: "providerId",
					value: "credential",
				},
			],
		});
		expect(initialAccounts.length).toBe(1);
		const initialUpdatedAt = initialAccounts[0]!.updatedAt;

		await new Promise((resolve) => setTimeout(resolve, 100));

		// Change password
		const updated = await client.changePassword({
			newPassword: "newPassword123",
			currentPassword: "originalPassword",
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(updated.data).toBeDefined();

		// Get updated account data
		const updatedAccounts: Account[] = await db.findMany({
			model: "account",
			where: [
				{
					field: "userId",
					value: userId!,
				},
				{
					field: "providerId",
					value: "credential",
				},
			],
		});
		expect(updatedAccounts.length).toBe(1);
		const newUpdatedAt = updatedAccounts[0]!.updatedAt;

		// Verify updatedAt was refreshed
		expect(newUpdatedAt).not.toBe(initialUpdatedAt);
		expect(new Date(newUpdatedAt).getTime()).toBeGreaterThan(
			new Date(initialUpdatedAt).getTime(),
		);
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
		await globalRunWithClient(async (headers) => {
			const newHeaders = new Headers();
			await client.changePassword({
				newPassword: "newPassword",
				currentPassword: testUser.password,
				revokeOtherSessions: true,
				fetchOptions: {
					onSuccess: sessionSetter(newHeaders),
				},
			});
			const cookie = newHeaders.get("cookie");
			const oldCookie = headers.get("cookie");
			expect(cookie).not.toBe(oldCookie);
			// Try to use the old session - it should be revoked
			const sessionAttempt = await client.getSession();
			// The old session should still be invalidated even though we're using runWithClient
			// because revokeOtherSessions should have invalidated it on the server
			expect(sessionAttempt.data).toBeNull();
		});
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
		// @ts-expect-error
		expect(session?.user.newField).toBe("new");
	});

	it("should propagate updates across sessions when secondaryStorage is enabled", async () => {
		const store = new Map<string, string>();
		const { client: authClient, signInWithTestUser: signIn } =
			await getTestInstance({
				secondaryStorage: {
					set(key, value) {
						store.set(key, value);
					},
					get(key) {
						return store.get(key) || null;
					},
					delete(key) {
						store.delete(key);
					},
				},
			});

		const { headers: headers1 } = await signIn();
		const { headers: headers2 } = await signIn();

		await authClient.updateUser({
			name: "updatedName",
			fetchOptions: {
				headers: headers1,
			},
		});

		const secondSession = await authClient.getSession({
			fetchOptions: {
				headers: headers2,
				throw: true,
			},
		});
		expect(secondSession?.user.name).toBe("updatedName");

		const firstSession = await authClient.getSession({
			fetchOptions: {
				headers: headers1,
				throw: true,
			},
		});

		expect(firstSession?.user.name).toBe("updatedName");
	});

	it("should not allow updating user with additional fields that are input: false", async () => {
		const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance(
			{
				user: {
					additionalFields: {
						newField: {
							type: "string",
							defaultValue: "default",
							input: false,
						},
					},
				},
			},
		);
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
			plugins: [inferAdditionalFields<typeof auth>()],
		});
		const { headers } = await signInWithTestUser();
		const res = await client.updateUser(
			{
				//@ts-expect-error - newField is not available in the user input
				newField: "new",
			},
			{
				headers,
			},
		);
		expect(res.error).toBeDefined();
		expect(res.error?.message).toBe("newField is not allowed to be set");
	});
});

describe("delete user", async () => {
	it("should not delete user if deleteUser is disabled", async () => {
		const { client, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: false,
				},
			},
		});
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const res = await client.deleteUser();
			console.log(res);
		});
	});
	it("should delete the user with a fresh session", async () => {
		const { client, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
			session: {
				freshAge: 1000,
			},
		});
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const res = await client.deleteUser();
			expect(res.data).toMatchObject({
				success: true,
			});
			const session = await client.getSession();
			expect(session.data).toBeNull();
		});
	});

	it("should delete every session from deleted user", async () => {
		const store = new Map<string, string>();
		const { client, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
			},
			secondaryStorage: {
				set(key, value) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
		});

		// Create a second session
		const { headers } = await signInWithTestUser();
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		// Check if there are multiple sessions
		const userId = session.data!.session.userId;
		const sessions = JSON.parse(
			store.get(`active-sessions-${userId}`)!,
		) as Array<Session>;
		expect(sessions.length).toBe(2);

		// Delete user
		await client.deleteUser({
			fetchOptions: {
				headers,
			},
		});

		// All sessions should be gone now
		expect(store.get(`active-sessions-${userId}`)).toBeUndefined();
		expect(store.size).toBe(0);
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
		const { runWithUser } = await signInWithTestUser();
		await runWithUser(async () => {
			const res = await client.deleteUser({
				password: testUser.password,
			});
			expect(res.data).toMatchObject({
				success: true,
			});
			expect(token.length).toBe(32);
			const session = await client.getSession();
			expect(session.data).toBeDefined();
			const deleteCallbackRes = await client.deleteUser({
				token,
			});
			expect(deleteCallbackRes.data).toMatchObject({
				success: true,
			});
			const nullSession = await client.getSession();
			expect(nullSession.data).toBeNull();
		});
	});

	it("should ignore cookie cache for sensitive operations like changePassword", async () => {
		const { client: cacheClient, sessionSetter: cacheSessionSetter } =
			await getTestInstance(
				{
					session: {
						cookieCache: {
							enabled: true,
							maxAge: 60,
						},
					},
				},
				{
					disableTestUser: true,
				},
			);

		const uniqueEmail = `cache-test-${Date.now()}@test.com`;
		const testPassword = "testPassword123";

		await cacheClient.signUp.email({
			email: uniqueEmail,
			password: testPassword,
			name: "Cache Test User",
		});

		const cacheHeaders = new Headers();
		await cacheClient.signIn.email({
			email: uniqueEmail,
			password: testPassword,
			fetchOptions: {
				onSuccess: cacheSessionSetter(cacheHeaders),
			},
		});

		const initialSession = await cacheClient.getSession({
			fetchOptions: {
				headers: cacheHeaders,
				throw: true,
			},
		});
		expect(initialSession?.user).toBeDefined();

		const changePasswordResult = await cacheClient.changePassword({
			newPassword: "newSecurePassword123",
			currentPassword: testPassword,
			revokeOtherSessions: true,
			fetchOptions: {
				headers: cacheHeaders,
			},
		});

		expect(changePasswordResult.data).toBeDefined();

		const sessionAfterPasswordChange = await cacheClient.getSession({
			fetchOptions: {
				headers: cacheHeaders,
			},
		});

		expect(sessionAfterPasswordChange.data).toBeNull();
	});
});
