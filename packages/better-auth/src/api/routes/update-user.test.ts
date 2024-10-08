import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import type { User } from "../../types";

describe("updateUser", async () => {
	const { auth, client, testUser, sessionSetter, customFetchImpl, db } =
		await getTestInstance();
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
		expect(updated.data?.name).toBe("newName");
	});

	it("should update the user's password", async () => {
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
			email: testUser.email,
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
		const sessionAttempt = await client.session({
			fetchOptions: {
				headers: headers,
			},
		});
		expect(sessionAttempt.data).toBeNull();
	});

	it("should delete the user", async () => {
		const headers = new Headers();
		const deleted = await client.user.delete({
			password: testUser.password,
			fetchOptions: {
				headers,
			},
		});
		const deletedUser = await db.findOne<User>({
			where: [
				{
					field: "email",
					value: testUser.email,
				},
			],
			model: "user",
		});
		expect(deletedUser?.deletedAt).not.toBeNull();
		expect(deleted.data).toBe(null);
	});
});
