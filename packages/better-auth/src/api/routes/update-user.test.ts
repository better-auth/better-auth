import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("updateUser", async () => {
	const sendChangeEmail = vi.fn();
	let emailVerificationToken = "";
	const { client, testUser, sessionSetter, db } = await getTestInstance({
		emailVerification: {
			async sendVerificationEmail(user, url, token) {
				emailVerificationToken = token;
			},
		},
		user: {
			changeEmail: {
				enabled: true,
				sendChangeEmailVerification: async (user, newEmail, url, token) => {
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
		const updated = await client.user.update({
			name: "newName",
			fetchOptions: {
				headers,
			},
		});
		expect(updated.data?.user.name).toBe("newName");
	});

	it("should update user email", async () => {
		const newEmail = "new-email@email.com";
		const res = await client.user.changeEmail({
			newEmail,
			fetchOptions: {
				headers: headers,
			},
		});
		expect(res.data?.user.email).toBe(newEmail);
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
		await client.user.changeEmail({
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
		const updated = await client.user.changePassword({
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
		await client.user.changePassword({
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
});
