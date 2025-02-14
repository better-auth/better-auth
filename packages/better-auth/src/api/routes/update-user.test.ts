import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

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

describe("delete user", async () => {
	it("should delete the user", async () => {
		const { auth, client, signInWithTestUser } = await getTestInstance({
			user: {
				deleteUser: {
					enabled: true,
				},
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

	it("should delete with verification flow", async () => {
		let token = "";
		const { client, signInWithTestUser } = await getTestInstance({
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
